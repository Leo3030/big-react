import {
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_getCurrentPriorityLevel
} from 'scheduler';
import { FiberRootNode } from './fiber';
import ReactCurrentBatchConfig from 'react/src/currentBatchConfig';

export type Lane = number;
export type Lanes = number;

export const SyncLane = 0b00001;
export const InputContinuesLane = 0b00010;
export const DefaultLane = 0b00100;
export const IdleLane = 0b10000;
export const TransitionLane = 0b01000;
export const NoLane = 0b00000;
export const NoLanes = 0b00000;

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	return laneA | laneB;
}

export function requestUpdateLane() {
	const isTransition = ReactCurrentBatchConfig.transition !== null;
	if (isTransition) {
		return TransitionLane;
	}

	//从上下文环境中获取scheduler优先级
	const currentPriority = unstable_getCurrentPriorityLevel();
	return schedulerToLanePriority(currentPriority);
}

export function getHeighestPriorityLane(lanes: Lanes): Lane {
	return lanes & -lanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lane) {
	return (set & subset) === subset;
}

export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
	root.suspenedLanes = NoLanes;
	root.pingLanes = NoLanes;
}

export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHeighestPriorityLane(lanes);

	if (lane === SyncLane) {
		return unstable_ImmediatePriority;
	}

	if (lane === InputContinuesLane) {
		return unstable_UserBlockingPriority;
	}

	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}

	return unstable_IdlePriority;
}

export function schedulerToLanePriority(schedulePriority: number): Lane {
	if (schedulePriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulePriority === unstable_UserBlockingPriority) {
		return InputContinuesLane;
	}
	if (schedulePriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
	// return IdleLane;
}
export function markRootSuspened(root: FiberRootNode, suspenedLanes: Lanes) {
	root.suspenedLanes |= suspenedLanes;
	root.pendingLanes &= ~suspenedLanes;
}

export function markRookPinged(root: FiberRootNode, pingdLanes: Lanes) {
	root.pingLanes |= root.suspenedLanes & pingdLanes;
}

export function getNextLane(root: FiberRootNode): Lane {
	const pendingLanes = root.pendingLanes;

	if (pendingLanes === NoLanes) {
		return NoLanes;
	}

	let nextLane = NoLane;
	const suspenedLanes = pendingLanes & ~root.suspenedLanes;
	if (suspenedLanes !== NoLanes) {
		nextLane = getHeighestPriorityLane(suspenedLanes);
	} else {
		const pingdLanes = pendingLanes & root.pendingLanes;

		if (pingdLanes !== NoLanes) {
			nextLane = getHeighestPriorityLane(pingdLanes);
		}
	}

	return nextLane;
}

export function includeSomeLanes(set: Lanes, subset: Lane | Lanes): boolean {
	return (set & subset) !== NoLane;
}

export function removeLanes(set: Lanes, subset: Lanes | Lane): Lane {
	return set & ~subset;
}
