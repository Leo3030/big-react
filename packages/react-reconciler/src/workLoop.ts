import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority
} from 'scheduler';

import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffect
} from './commitWork';
import { completeWork } from './completeWork';
import {
	FiberNode,
	createWorkInProgress,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import {
	Lane,
	NoLane,
	SyncLane,
	getHeighestPriorityLane,
	markRootFinished,
	mergeLanes
} from './fiberLanes';
import { MutationMask, NoFlags, PassiveMask } from './filberFlags';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import { HookHasEffect, Passive } from './hookEffectTags';

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoseHasPassiveEffects: boolean = false;

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateFromFiberFiber(fiber);
	markRootUpdated(root, lane);
	// renderRoot(root);
	ensureRootIsScheduled(root);
}

//schedule阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getHeighestPriorityLane(root.pendingLanes);

	if (updateLane === NoLane) {
		return;
	}
	if (updateLane === SyncLane) {
		//同步优先级，用微任务调度
		if (__DEV__) {
			console.log('在微任务重调度，优先级', updateLane);
		}
		// [performSyncWorkOnRoot, performSyncWorkOnRoot,performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		//其他优先级，用宏任务调度
	}
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

function markUpdateFromFiberFiber(fiber: FiberNode) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}

	if (node.tag === HostRoot) {
		return node.stateNode;
	}

	return null;
}

function performSyncWorkOnRoot(root: FiberRootNode, lane: Lane) {
	const nextLane = getHeighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		//其他比syncLane低的优先级，或者no lane
		ensureRootIsScheduled(root);
		return;
	}
	if (__DEV__) {
		console.warn('render阶段开始');
	}
	// 初始化
	prepareFreshStack(root, lane);
	do {
		try {
			workLoop();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('Work Loop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;
	root.finishedLane = lane;
	wipRootRenderLane = NoLane;
	// wip fiberNode树，树中的falgs
	commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	const lane = root.finishedLane;
	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finished不应该是NoLane');
	}
	//重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	markRootFinished(root, lane);

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 代表本次work有副作用
		if (!rootDoseHasPassiveEffects) {
			rootDoseHasPassiveEffects = true;
			//调度副作用
			scheduleCallback(NormalPriority, () => {
				//执行副作用
				flushPassiveEffect(root.pendingPassiveEffects);
				return;
			});
		}
	}

	//判断是否存在3个字阶段需要执行的操作
	//root flags or root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation
		commitMutationEffect(finishedWork, root);
		root.current = finishedWork;
		// layout
	} else {
		root.current = finishedWork;
	}
	rootDoseHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffect(pendingPassiveEffects: PendingPassiveEffects) {
	// 先执行destroy，在执行create
	pendingPassiveEffects.unmount.forEach((effect) => {
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
}

function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane);
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		completeUnitOfWrok(fiber);
	} else {
		workInProgress = next;
	}
}

function completeUnitOfWrok(fiber: FiberNode) {
	let node: FiberNode | null = fiber;
	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}

		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
