import { HookDeps } from 'react-reconciler/src/fiberHooks';
import { Action, ReactContext, Useable } from 'shared/ReactTypes';

export interface Dispatcher {
	useState: <T>(initialState: () => T | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: HookDeps | undefined) => void;
	useTransition: () => [boolean, (callback: () => void) => void];
	useRef: <T>(initalVal: T) => { current: T };
	useContext: <T>(context: ReactContext<T>) => T;
	useMemo: <T>(nextCreate: () => T, deps: HookDeps | undefined) => T;
	useCallback: <T>(callback: T, deps: HookDeps | undefined) => T;
	use: <T>(useable: Useable<T>) => T;
}

export type Dispatch<State> = (action: Action<State>) => void;

const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;

	if (dispatcher === null) {
		throw new Error('hook只能在函数组件中执行');
	}

	return dispatcher;
};

export default currentDispatcher;
