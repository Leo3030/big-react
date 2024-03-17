import { ReactElementType } from 'shared/ReactTypes';
import {
	FiberNode,
	OffscreenProps,
	createFiberFromFragment,
	createFiberFromOffscreen,
	createWorkInProgress
} from './fiber';
import { UpdateQueue, processUpadteQueue } from './updateQueue';
import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent,
	SuspenseComponent
} from './workTags';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { renderWithHooks } from './fiberHooks';
import { Lane, NoLanes } from './fiberLanes';
import {
	ChildDeletion,
	DidCapture,
	NoFlags,
	Placement,
	Ref
} from './fiberFlags';
import { pushProvider } from './fiberContext';
import { pushSuspenseHandler } from './suspenseContext';

// 递归中的递阶段
export const beginWork = (wip: FiberNode, renderLane: Lane) => {
	// bailout 策略直接返回复用的结果

	wip.lanes = NoLanes;

	// 比较再返回子FiberNode
	switch (wip.tag) {
		case HostRoot:
			//1.计算状态的最新值
			//2.创建子fiberNode
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFuncComponent(wip, renderLane);
		case Fragment:
			return updateFragment(wip);
		case ContextProvider:
			return updateContextProvider(wip);
		case SuspenseComponent:
			return updateSuspenseComponent(wip);
		case OffscreenComponent:
			return updateOffscreenComponent(wip);
		default:
			if (__DEV__) {
				console.warn('begin work未实现的类型');
			}
			break;
	}

	return null;
};

function updateContextProvider(wip: FiberNode) {
	const providerType = wip.type;
	const context = providerType._context;
	const newProps = wip.pendingProps;
	pushProvider(context, newProps.value);
	const nextChildren = newProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateSuspenseComponent(wip: FiberNode) {
	const current = wip.alternate;
	const nextProps = wip.pendingProps;

	let showFallback = false;
	const didSuspend = (wip.flags & DidCapture) !== NoFlags;

	if (didSuspend) {
		showFallback = true;
		wip.flags &= ~DidCapture;
	}

	const nextPrimaryChildren = nextProps.children;
	const nextFallbackChildren = nextProps.fallback;

	pushSuspenseHandler(wip);

	if (current === null) {
		//mount
		if (showFallback) {
			//挂起
			return mountSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return mountSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	} else {
		//update
		if (showFallback) {
			//挂起
			return updateSuspenseFallbackChildren(
				wip,
				nextPrimaryChildren,
				nextFallbackChildren
			);
		} else {
			//正常
			return updateSuspensePrimaryChildren(wip, nextPrimaryChildren);
		}
	}
	// reconcileChildren(wip, nextChildren);
	// return wip.child;
}

function updateSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildrenProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};

	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildrenProps
	);

	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = null;
	wip.child = primaryChildFragment;

	if (currentFallbackFragment !== null) {
		const deletions = wip.deletions;
		if (deletions === null) {
			wip.deletions = [currentFallbackFragment];
			wip.flags |= ChildDeletion;
		} else {
			wip.deletions?.push(currentFallbackFragment);
		}
	}

	return primaryChildFragment;
}

function mountSuspensePrimaryChildren(wip: FiberNode, primaryChildren: any) {
	const primaryChildrenProps: OffscreenProps = {
		mode: 'visible',
		children: primaryChildren
	};

	const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps);
	wip.child = primaryChildFragment;
	primaryChildFragment.return = wip;
	return primaryChildFragment;
}

function updateSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallabckChildren: any
) {
	const current = wip.alternate as FiberNode;
	const currentPrimaryChildFragment = current.child as FiberNode;
	const currentFallbackFragment: FiberNode | null =
		currentPrimaryChildFragment.sibling;

	const primaryChildrenProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};

	const primaryChildFragment = createWorkInProgress(
		currentPrimaryChildFragment,
		primaryChildrenProps
	);
	let fallbackChildFragment;

	if (currentFallbackFragment !== null) {
		fallbackChildFragment = createWorkInProgress(
			currentFallbackFragment,
			fallabckChildren
		);
	} else {
		fallbackChildFragment = createFiberFromFragment(fallabckChildren, null);
		fallbackChildFragment.flags |= Placement;
	}

	fallbackChildFragment.return = wip;
	primaryChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;
	return fallbackChildFragment;
}

function mountSuspenseFallbackChildren(
	wip: FiberNode,
	primaryChildren: any,
	fallabckChildren: any
) {
	const primaryChildrenProps: OffscreenProps = {
		mode: 'hidden',
		children: primaryChildren
	};
	const primaryChildFragment = createFiberFromOffscreen(primaryChildrenProps);
	const fallbackChildFragment = createFiberFromFragment(fallabckChildren, null);
	fallbackChildFragment.flags |= Placement;
	primaryChildFragment.return = wip;
	fallbackChildFragment.return = wip;
	primaryChildFragment.sibling = fallbackChildFragment;
	wip.child = primaryChildFragment;
	return fallbackChildFragment;
}

function updateOffscreenComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateFuncComponent(wip: FiberNode, renderLane: Lane) {
	reconcileChildren(wip, renderWithHooks(wip, renderLane));
	return wip.child;
}

function updateHostRoot(wip: FiberNode, renderLane: Lane) {
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<Element>;
	const pending = updateQueue.shared.pending;
	updateQueue.shared.pending = null;
	const { memoizedState } = processUpadteQueue(baseState, pending, renderLane);
	const current = wip.alternate;
	if (current !== null) {
		current.memoizedState = memoizedState;
	}
	wip.memoizedState = memoizedState;

	const nextChildren = wip.memoizedState;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	markRef(wip.alternate, wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate;

	if (current !== null) {
		// update
		wip.child = reconcileChildFibers(wip, current?.child, children);
	} else {
		// mount
		wip.child = mountChildFibers(wip, null, children);
	}
}

function markRef(current: FiberNode | null, wip: FiberNode) {
	const ref = wip.ref;

	if (
		(current === null && ref !== null) ||
		(current !== null && current.ref !== ref)
	) {
		//mount时， ref存在则标记 或者 update 时 ref引用变了
		wip.flags |= Ref;
	}
}
