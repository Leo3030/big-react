import { FiberNode } from './fiber';

const suspenseHanderStack: FiberNode[] = [];

export function getSuspenseHandler() {
	return suspenseHanderStack[suspenseHanderStack.length - 1];
}

export function pushSuspenseHandler(handler: FiberNode) {
	suspenseHanderStack.push(handler);
}

export function popSuspenseHandler() {
	suspenseHanderStack.pop();
}
