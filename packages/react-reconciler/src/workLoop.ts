import { beginWork } from './beginWork';
import { commitMutationEffect } from './commitWork';
import { completeWork } from './completeWork';
import { FiberNode, createWorkInProgress, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './filberFlags';
import { HostRoot } from './workTags';

let workInProgress: FiberNode | null = null;
function prepareFreshStack(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {});
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}

	//重置
	root.finishedWork = null;

	//判断是否存在3个字阶段需要执行的操作
	//root flags or root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation
		commitMutationEffect(finishedWork);
		root.current = finishedWork;
		// layout
	} else {
		root.current = finishedWork;
	}
}

function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber);
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
		const sibling = fiber.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
		}

		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

export function scheduleUpdateOnFiber(fiber: FiberNode) {
	const root = markUpdateFromFiberFiber(fiber);
	renderRoot(root);
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

function renderRoot(root: FiberRootNode) {
	console.log(112);
	// 初始化
	prepareFreshStack(root);
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

	// wip fiberNode树，树中的falgs
	commitRoot(root);
}
