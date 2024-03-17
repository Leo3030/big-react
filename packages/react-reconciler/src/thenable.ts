import {
	FullfilledThenable,
	PendingThenable,
	RejectedThenable,
	Thenable
} from 'shared/ReactTypes';

export const SuspenseException = new Error(
	'这不是真实的错误，是Suspense工作的一部分，如果你捕获到这个错误，请继续抛出'
);
function noop() {}

let suspenseThenable: Thenable<any> | null = null;

export function getSuspenseThenable(): Thenable<any> {
	if (suspenseThenable === null) {
		throw new Error('应该存在suspenseThenable，这是个bug');
	}

	const thenable = suspenseThenable;
	suspenseThenable = null;
	return thenable;
}

export function trackUseThenable<T>(thenable: Thenable<T>) {
	switch (thenable.status) {
		case 'fullfilled':
			return thenable.value;
		case 'rejected':
			throw thenable.reason;
		default:
			if (typeof thenable.status === 'string') {
				thenable.then(noop, noop);
			} else {
				// untracked

				//pending
				const pending = thenable as unknown as PendingThenable<T, void, any>;
				pending.status = 'pending';
				pending.then(
					(val) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const fullfilled: FullfilledThenable<T, void, any> = pending;
							(fullfilled.status = 'fullfilled'), (fullfilled.value = val);
						}
					},
					(err) => {
						if (pending.status === 'pending') {
							// @ts-ignore
							const fullfilled: RejectedThenable<T, void, any> = pending;
							(fullfilled.status = 'rejected'), (fullfilled.reason = err);
						}
					}
				);
			}
			break;
	}

	suspenseThenable = thenable;
	throw SuspenseException;
}
