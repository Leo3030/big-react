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
	getNextLane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspened,
	mergeLanes
} from './fiberLanes';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import { HookHasEffect, Passive } from './hookEffectTags';
import { SuspenseException, getSuspenseThenable } from './thenable';
import { resetHooksOnUnwind } from './fiberHooks';
import { throwException } from './fiberThrow';
import { unwindWork } from './fiberUnwindWork';

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoseHasPassiveEffects: boolean = false;

type RootExistStatus = number;
// 工作中状态
const RootInprogress: RootExistStatus = 0;
// 并发更新中途打断
const RootInComplete: RootExistStatus = 1;
//render 完成
const RootCompleted: RootExistStatus = 2;
// 由于挂起当前是未完成状态，	不用进入commit阶段
const RootDidNotComplete: RootExistStatus = 3;

let wipRootExitStatus: RootExistStatus = RootInprogress;

const NotSuspended = 0;
const SuspendedOnData = 1;
type SuspendedReason = typeof NotSuspended | typeof SuspendedOnData;

let wipSuspendedReason: SuspendedReason = NotSuspended;
let wipThrowValue: any = null;

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
	wipRootExitStatus = RootInprogress;
	wipSuspendedReason = NotSuspended;
	wipThrowValue = null;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateLaneFromFiberToRoot(fiber, lane);
	markRootUpdated(root, lane);
	// renderRoot(root);
	ensureRootIsScheduled(root);
}

//schedule阶段入口
export function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getNextLane(root);
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

export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

function markUpdateLaneFromFiberToRoot(fiber: FiberNode, lane: Lane) {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		parent.childLanes = mergeLanes(parent.childLanes, lane);
		const alternate = parent.alternate;

		if (alternate !== null) {
			alternate.childLanes = mergeLanes(alternate.childLanes, lane);
		}

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

	const lane = getNextLane(root);
	const currentCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	//render 阶段
	const existStatus = renderRoot(root, lane, !needSync);

	switch (existStatus) {
		case RootInComplete:
			// 中断
			if (root.callbackNode !== currentCallbackNode) {
				return null;
			}
			return performConcurrentWorkOnRoot.bind(null, root);
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = lane;
			wipRootRenderLane = NoLane;
			commitRoot(root);
			break;
		case RootDidNotComplete:
			wipRootRenderLane = NoLane;
			markRootSuspened(root, lane);
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.warn('还未实现并发更新结束状态');
			}
			break;
	}
}

function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getNextLane(root);
	if (nextLane !== SyncLane) {
		//其他比syncLane低的优先级，或者no lane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);
	switch (existStatus) {
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = nextLane;
			wipRootRenderLane = NoLane;
			// wip fiberNode树，树中的falgs
			commitRoot(root);
			break;
		case RootDidNotComplete:
			wipRootRenderLane = NoLane;
			markRootSuspened(root, nextLane);
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.warn('还未实现同步更新结束状态');
			}
			break;
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
			if (wipSuspendedReason !== NotSuspended && workInProgress !== null) {
				//unwind
				const throwValue = wipThrowValue;
				wipSuspendedReason = NotSuspended;
				wipThrowValue = null;
				throwAndUnwindWorkLoop(root, workInProgress, throwValue, lane);
			}

			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('Work Loop发生错误', e);
			}
			handleThrow(root, e);
			// 可以处理Error Boundary
		}
	} while (true);

	if (wipRootExitStatus !== RootInprogress) {
		return wipRootExitStatus;
	}

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

function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode,
	throwValue: any,
	lane: Lane
) {
	// 重置FC 全局变量
	resetHooksOnUnwind(unitOfWork);
	// 请求返回后重新触发更新
	throwException(root, throwValue, lane);
	// unwind
	unwindUnitOfWork(unitOfWork);
}

function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork;

	do {
		const next = unwindWork(incompleteWork);
		if (next !== null) {
			workInProgress = next;
			return;
		}

		const returnFiber = incompleteWork.return as FiberNode;
		if (returnFiber !== null) {
			returnFiber.deletions = null;
		}
		incompleteWork = returnFiber;
	} while (incompleteWork !== null);
	//使用了use，抛出了data，但没有定义suspense
	wipRootExitStatus = RootDidNotComplete;
	workInProgress = null;
}

function handleThrow(root: FiberRootNode, throwValue: any) {
	// 可以处理Error Boundary
	if (throwValue === SuspenseException) {
		throwValue = getSuspenseThenable();
	}

	wipThrowValue = throwValue;
	wipSuspendedReason = SuspendedOnData;
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
