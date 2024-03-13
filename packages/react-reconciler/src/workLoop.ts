import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';

import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitLayoutEffect,
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
	lanesToSchedulerPriority,
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

type RootExistStatus = number;
const RootInComplete: RootExistStatus = 1;
const RootCompleted: RootExistStatus = 2;
//TODO: 执行过程中报错还需要一种状态

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
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
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}

	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务重调度，优先级`,
			updateLane
		);
	}

	if (updateLane === SyncLane) {
		//同步更新，用微任务调度

		// [performSyncWorkOnRoot, performSyncWorkOnRoot,performSyncWorkOnRoot]
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		//其他优先级（并发更新），用宏任务调度
		const schedulePriority = lanesToSchedulerPriority(updateLane);
		newCallbackNode = scheduleCallback(
			schedulePriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}

	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
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

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// 保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffect(root.pendingPassiveEffects);

	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return null;
		}
	}

	const lane = getHeighestPriorityLane(root.pendingLanes);
	const currentCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	//render 阶段
	const existStatus = renderRoot(root, lane, !needSync);

	ensureRootIsScheduled(root);
	if (existStatus === RootInComplete) {
		if (root.callbackNode !== currentCallbackNode) {
			return null;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}

	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;
		// wip fiberNode树，树中的falgs
		commitRoot(root);
	} else if (__DEV__) {
		console.warn('还未实现并发更新结束状态');
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHeighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		//其他比syncLane低的优先级，或者no lane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);

	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;
		// wip fiberNode树，树中的falgs
		commitRoot(root);
	} else if (__DEV__) {
		console.warn('还未实现同步更新结束状态');
	}
}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.warn(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}
	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}

	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('Work Loop发生错误', e);
			}
			workInProgress = null;
		}
	} while (true);

	//中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}

	//render执行完了
	if (!shouldTimeSlice && workInProgress !== null) {
		console.error('render阶段结束时wip不应该不为null');
	}
	return RootCompleted;

	// const finishedWork = root.current.alternate;
	// root.finishedWork = finishedWork;
	// root.finishedLane = lane;
	// wipRootRenderLane = NoLane;
	// // wip fiberNode树，树中的falgs
	// commitRoot(root);
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

		commitLayoutEffect(finishedWork, root);
	} else {
		root.current = finishedWork;
	}
	rootDoseHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffect(pendingPassiveEffects: PendingPassiveEffects) {
	// 先执行destroy，在执行create
	let didFlushPassiveEffect = false;
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});

	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
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
