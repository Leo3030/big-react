import { CallbackNode } from 'scheduler';
import './style.css';
import {
	unstable_LowPriority as LowPriority,
	unstable_NormalPriority as NormalPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_ImmediatePriority as ImmediatePriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';

const button = document.querySelector('button');
const root = document.querySelector('#root');

type Priority =
	| typeof LowPriority
	| typeof NormalPriority
	| typeof IdlePriority
	| typeof ImmediatePriority
	| typeof UserBlockingPriority;

interface Work {
	count: number;
	priority: Priority;
}

[LowPriority, NormalPriority, ImmediatePriority, UserBlockingPriority].forEach(
	(priority) => {
		const btn = document.createElement('button');
		root?.appendChild(btn);
		btn.innerText = [
			'',
			'ImmediatePriority',
			'UserBlockingPriority',
			'NormalPriority',
			'LowPriority'
		][priority];
		btn.onclick = () => {
			workList.unshift({
				count: 100,
				priority: priority as Priority
			});
			schedule();
		};
	}
);

const workList: Work[] = [];
let prevPriority: Priority = IdlePriority;
let curCallback: CallbackNode | null = null;

function schedule() {
	const cbNode = getFirstCallbackNode();
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	if (!curWork) {
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}
	const { priority: curPriority } = curWork;
	//TODO: 策略逻辑
	if (curPriority === prevPriority) {
		return;
	}

	//更高级的优先级
	cbNode && cancelCallback(cbNode);

	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority
	 * 2. 饥饿问题 （一直不执行则增加优先级，直到被同步执行）
	 * 3. 时间切片
	 */
	const needSync = work.priority === ImmediatePriority || didTimeout;
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	//执行完 || 中断执行
	prevPriority = work.priority;

	if (!work.count) {
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority;
	}

	const prevCallback = curCallback;
	schedule();
	const newCallback = curCallback;

	if (newCallback && newCallback === prevCallback) {
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `pri-${content}`;
	doSomeBuzyWork(1000000);
	root?.appendChild(span);
}
function doSomeBuzyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}

console.log('button: ', button);
button &&
	(button.onclick = () => {
		workList.unshift({
			count: 100
		});
		schedule();
	});
