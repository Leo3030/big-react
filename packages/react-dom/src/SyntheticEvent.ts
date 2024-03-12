//合成事件
// dom[xxx] =reactElement props

import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority,
	unstable_runWithPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

export const elementPropsKeys = '__props';
const validEventTypeList: string[] = ['click'];

type EventCallback = (e: Event) => void;

interface Paths {
	bubble: EventCallback[];
	capture: EventCallback[];
}

interface SyntheticEvent extends Event {
	__stopPropagation: boolean;
}

export interface DOMElement extends Element {
	[elementPropsKeys]: Props;
}

export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKeys] = props;
}

export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件');
	}

	if (__DEV__) {
		console.log('初始化事件', eventType);
	}
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targeElement = e.target;
	if (targeElement === null) {
		console.warn('事件不存在target', e);
		return;
	}
	//1.收集沿途的事件
	const { bubble, capture } = collectPaths(
		targeElement as DOMElement,
		container,
		eventType
	);
	//2.构造合成事件
	const se = createSyntheticEvent(e);
	//3.遍历capture
	triggerEventFlow(capture, se);

	if (!se.__stopPropagation) {
		//4.遍历bubble
		triggerEventFlow(bubble, se);
	}
}

function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		unstable_runWithPriority(eventTypeToSchedulerPriority(se.type), () => {
			callback.call(null, se);
		});

		if (se.__stopPropagation) {
			break;
		}
	}
}

function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;
	const originStopPropagation = e.stopPropagation;

	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;

		if (originStopPropagation) {
			originStopPropagation();
		}
	};
	return syntheticEvent;
}

function getEventCallbackFromEventType(
	eventType: string
): string[] | undefined {
	return {
		//顺序是有先后的，先捕获，再冒泡
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		bubble: [],
		capture: []
	};

	while (targetElement && targetElement !== container) {
		const elementProps = targetElement[elementPropsKeys];
		if (elementProps) {
			// click -> onClick\onClickCapture
			const callbackNameList = getEventCallbackFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i == 0) {
							//capture
							paths.capture.unshift(eventCallback);
						} else {
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}
		targetElement = targetElement.parentNode as DOMElement;
	}

	return paths;
}

/**
 * 根据用户的行为定义不同的优先级
 * @param eventType
 * @returns
 */
function eventTypeToSchedulerPriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
