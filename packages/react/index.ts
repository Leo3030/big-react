import { jsx, isValidElement as isValidElementFN } from 'react/src/jsx';
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import currentBatchConfig from './src/currentBatchConfig';
import { Useable } from 'shared/ReactTypes';
export {
	REACT_SUSPENSE_TYPE as Suspense,
	REACT_FRAGMENT_TYPE as Fragment
} from 'shared/ReactSymbols';
export { createContext } from './src/context';
export { memo } from './src/memo';

export const useState: Dispatcher['useState'] = (initialState: any) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

export const useRef: Dispatcher['useRef'] = (initalVal) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useRef(initalVal);
};

export const useContext: Dispatcher['useContext'] = (context) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useContext(context);
};

export const use: Dispatcher['use'] = <T>(useable: Useable<T>) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.use(useable);
};

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRE = {
	currentDispatcher,
	currentBatchConfig
};

export const version = '0.0.0';
export const createElement = jsx;

export const isValidElement = isValidElementFN;
