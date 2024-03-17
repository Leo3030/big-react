import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane, NoLane, isSubsetOfLanes, mergeLanes } from './fiberLanes';
import { FiberNode } from './fiber';

export interface Update<State> {
	action: Action<State>;
	lane: Lane;
	next: Update<any> | null;
}

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

export const createUpdate = <State>(action: Action<State>, lane: Lane) => {
	return {
		action,
		lane,
		next: null
	};
};

export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

export const enqueueUpdateQueue = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>,
	fiber: FiberNode,
	lane: Lane
) => {
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		// pending -> a -> a 环状链表
		update.next = update;
	} else {
		// pending -> b -> a -> b 环状链表
		update.next = pending.next;
		pending.next = update;
	}
	updateQueue.shared.pending = update;
	fiber.lanes = mergeLanes(fiber.lanes, lane);
	const alternate = fiber.alternate;

	if (alternate !== null) {
		alternate.lanes = mergeLanes(alternate.lanes, lane);
	}
};

export const processUpadteQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane,
	onSkipUpdate?: <State>(update: Update<State>) => void
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpadteQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};
	if (pendingUpdate !== null) {
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState;
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;
		let newState = baseState;

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够，被跳过
				// if (__DEV__) {
				// 	console.error('不应该进入这个逻辑');
				// }
				const clone = createUpdate(pending.action, pending.lane);
				onSkipUpdate?.(clone);
				//是不是第一个被跳过的update
				if (newBaseQueueFirst === null) {
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					newBaseState = newState;
				} else {
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				//优先级足够的情况
				if (newBaseQueueFirst !== null) {
					const clone = createUpdate(pending.action, NoLane);
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					// baseState: 1 pendingUpdate: (x) => 4x result: 4
					newState = action(baseState);
				} else {
					// baseState: 1 pendingUpdate: 2 result: 2
					newState = action;
				}
			}
			pending = pending?.next as Update<any>;
		} while (first !== pending);

		if (newBaseQueueFirst === null) {
			// 本地计算没有update没有被跳过
			newBaseState = newState;
		} else {
			(newBaseQueueLast as Update<State>).next = newBaseQueueFirst;
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	}

	return result;
};
