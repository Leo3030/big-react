import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdateQueue,
	processUpadteQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

let currentRenderFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;

const { currentDispatcher } = internals;

export function renderWithHooks(wip: FiberNode) {
	//赋值操作

	currentRenderFiber = wip;

	//重置
	wip.memoizedState = null;

	const current = wip.alternate;
	if (current !== null) {
		//update
		currentDispatcher.current = HooksDispatchOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatchOnMount;
	}

	const Component = wip.type;
	const props = wip.pendingProps;
	const child = Component(props);

	//重置操作
	currentRenderFiber = null;
	workInProgressHook = null;
	currentHook = null;
	return child;
}

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

const HooksDispatchOnMount: Dispatcher = {
	useState: mountState
};

const HooksDispatchOnUpdate: Dispatcher = {
	useState: updateState
};

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	//找到当前useState对应的数据
	const hook = mountWorkInProgressHook();
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	const queue = createUpdateQueue<State>();

	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentRenderFiber, queue);
	queue.dispatch = dispatch;

	return [memoizedState, dispatch];
}

function updateState<State>(): [State, Dispatch<State>] {
	//找到当前useState对应的数据
	const hook = updateWorkInProgressHook();
	// 计算新state的逻辑
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;

	if (pending !== null) {
		const { memoizedState } = processUpadteQueue(hook.memoizedState, pending);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const update = createUpdate(action);
	enqueueUpdateQueue(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = { memoizedState: null, updateQueue: null, next: null };

	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentRenderFiber === null) {
			// 表示没有在函数组件内调用hook
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentRenderFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时后续的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}

	return workInProgressHook;
}

function updateWorkInProgressHook(): Hook {
	//TODO： render阶段触发的更新
	let nextCurrentHook: Hook | null;
	if (currentHook === null) {
		// 这是FC update时的第一个hook
		const current = currentRenderFiber?.alternate;
		if (current !== null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			nextCurrentHook = null;
		}
	} else {
		// 这是FC update后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		//  mount/update时 hooks数量不对

		throw new Error(
			`组件 ${currentRenderFiber?.type}本次执行时的Hook比上次执行时多`
		);
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null
	};

	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentRenderFiber === null) {
			// 表示没有在函数组件内调用hook
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			currentRenderFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时后续的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}

	return workInProgressHook;
}
