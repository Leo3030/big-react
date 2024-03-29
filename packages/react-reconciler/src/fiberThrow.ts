import { Wakeable } from 'shared/ReactTypes';
import { FiberRootNode } from './fiber';
import { ensureRootIsScheduled, markRootUpdated } from './workLoop';
import { Lane, markRookPinged } from './fiberLanes';
import { getSuspenseHandler } from './suspenseContext';
import { ShouldCapture } from './fiberFlags';

export function throwException(root: FiberRootNode, value: any, lane: Lane) {
	// Error Boundray
	// thenable
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof value.then === 'function'
	) {
		const wakeable: Wakeable<any> = value;

		const suspenseBoundary = getSuspenseHandler();

		if (suspenseBoundary) {
			suspenseBoundary.flags |= ShouldCapture;
		}
		attachPingListener(root, wakeable, lane);
	}
}

export function attachPingListener(
	root: FiberRootNode,
	wakeable: Wakeable<any>,
	lane: Lane
) {
	let pingCache = root.pingCache;
	// WeakMap{promise: Set<Lane>}
	let threadIDs: Set<Lane> | undefined;

	if (pingCache === null) {
		threadIDs = new Set<Lane>();
		pingCache = root.pingCache = new WeakMap<Wakeable<any>, Set<Lane>>();
		pingCache.set(wakeable, threadIDs);
	} else {
		threadIDs = pingCache.get(wakeable);

		if (threadIDs === undefined) {
			threadIDs = new Set<Lane>();
			pingCache.set(wakeable, threadIDs);
		}
	}
	if (!threadIDs.has(lane)) {
		threadIDs.add(lane);

		//
		// eslint-disable-next-line no-inner-declarations
		function ping() {
			if (pingCache !== null) {
				pingCache.delete(wakeable);
			}

			markRookPinged(root, lane);
			markRootUpdated(root, lane);
			ensureRootIsScheduled(root);
		}

		wakeable.then(ping, ping);
	}
}
