import internals from 'shared/internals';
import { FiberNode } from './fiber';
import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import currentBatchConfig from 'react/src/currentBatchConfig';
import {
	Update,
	UpdateQueue,
	basicStateReducer,
	createUpdate,
	createUpdateQueue,
	enqueueUpdateQueue,
	processUpadteQueue
} from './updateQueue';
import { Action, ReactContext, Thenable, Useable } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import {
	Lane,
	NoLane,
	NoLanes,
	mergeLanes,
	removeLanes,
	requestUpdateLane
} from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { trackUseThenable } from './thenable';
import { markWipReceivedUpdate } from './beginWork';

let currentRenderFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher } = internals;

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: EffectDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
	lastRenderedState: State;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	//赋值操作

	currentRenderFiber = wip;
	renderLane = lane;

	//重置
	//重置hook链表
	wip.memoizedState = null;
	//重置effect链表
	wip.updateQueue = null;
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
	renderLane = NoLane;
	return child;
}

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
}

const HooksDispatchOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use
};

const HooksDispatchOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use
};

// re = useRef(init)
function mountRef<T>(initalVal: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initalVal };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(): { current: T } {
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
}

function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	(currentRenderFiber as FiberNode).flags |= PassiveEffect;

	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		const prevEffect = currentHook?.memoizedState as Effect;
		destroy = prevEffect.destroy;
		if (nextDeps !== null) {
			//浅比较依赖
			const prevDeps = prevEffect.deps;
			if (areHookInputsEuqal(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		//浅比较后不相等
		(currentRenderFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEuqal(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (nextDeps === null || prevDeps === null) {
		return false;
	}

	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}

	return true;
}

const pushEffect = (
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect => {
	// effect自己会形成一个环状链表
	const effect: Effect = { tag: hookFlags, create, destroy, deps, next: null };
	const fiber = currentRenderFiber as FiberNode;
	let updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		//插入effect的操作
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}

	return effect;
};

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

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

	const queue = createFCUpdateQueue<State>();

	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	hook.baseState = memoizedState;
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentRenderFiber, queue);
	queue.dispatch = dispatch;
	queue.lastRenderedState = memoizedState;
	return [memoizedState, dispatch];
}

function updateState<State>(): [State, Dispatch<State>] {
	//找到当前useState对应的数据
	const hook = updateWorkInProgressHook();
	// 计算新state的逻辑
	const queue = hook.updateQueue as FCUpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;
	if (pending !== null) {
		if (baseQueue !== null) {
			const baseFirst = baseQueue.next;
			const pendingFirst = pending.next;
			pending.next = baseFirst;
			pending.next = pendingFirst;
		}

		baseQueue = pending;
		current.baseQueue = pending;
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const prevState = hook.memoizedState;
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpadteQueue(baseState, baseQueue, renderLane, (update) => {
			const skippedLane = update.lane;
			const fiber = currentRenderFiber as FiberNode;
			// NoLane
			fiber.lanes = mergeLanes(fiber.lanes, skippedLane);
		});

		if (!Object.is(prevState, memoizedState)) {
			markWipReceivedUpdate();
		}

		hook.memoizedState = memoizedState;
		hook.baseQueue = newBaseQueue;
		hook.baseState = newBaseState;
		queue.lastRenderedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function mountTransition(): [boolean, (callback: () => void) => void] {
	const [isPending, setPending] = mountState(false);
	const hook = mountWorkInProgressHook();

	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => void) => void] {
	const [isPending] = updateState();
	const hook = updateWorkInProgressHook();

	const start = hook.memoizedState;

	return [isPending as boolean, start];
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	currentBatchConfig.transition = 1;

	callback();
	setPending(false);
	currentBatchConfig.transition = prevTransition;
}

function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: FCUpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);

	//eager 策略
	const current = fiber.alternate;
	if (
		fiber.lanes === NoLanes &&
		(current === null || current.lanes === NoLanes)
	) {
		// 当前产生的update是这个fiber的第一个update
		// 计算更新的状态
		// 1.计算更新前的状态 2.计算状态的方法
		const currentState = updateQueue.lastRenderedState;
		const eagerState = basicStateReducer(currentState, action);
		update.hasEagerState = true;
		update.eagerState = eagerState;

		if (Object.is(currentState, eagerState)) {
			if (__DEV__) {
				console.warn('命中eagerState', fiber);
			}
			return;
		}
	}

	enqueueUpdateQueue(updateQueue, update, fiber, lane);
	scheduleUpdateOnFiber(fiber, lane);
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null,
		baseQueue: null,
		baseState: null
	};

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
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
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

function readContext<T>(context: ReactContext<T>): T {
	const consumer = currentRenderFiber;
	if (consumer === null) {
		throw new Error('只能在函数组件中调用useContext');
	}

	const value = context._currentValue;
	return value;
}

export function use<T>(useable: Useable<T>): T {
	if (useable !== null && typeof useable === 'object') {
		if (typeof (useable as Thenable<T>).then === 'function') {
			//thenable
			const thenable = useable as Thenable<T>;
			return trackUseThenable(thenable);
		} else if ((useable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = useable as ReactContext<T>;
			return readContext(context);
		}
	}
	throw new Error('不支持的use参数' + useable);
}
export function resetHooksOnUnwind(wip: FiberNode) {
	currentRenderFiber = null;
	currentHook = null;
	workInProgressHook = null;
}

export function bailoutHook(wip: FiberNode, renderLane: Lane) {
	const current = wip.alternate as FiberNode;
	wip.updateQueue = current?.updateQueue;
	wip.flags &= ~PassiveEffect;

	current.lanes = removeLanes(current?.lanes, renderLane);
}
