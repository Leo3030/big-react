import React from 'react';
import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
// import App from "./App.js";
// const root = ReactDOM.createRoot(document.getElementById("root"));
// root.render(<App />);

const App = () => {
	const [num, updateNum] = useState(0);
	useEffect(() => {
		console.log('App mount');
	}, []);

	useEffect(() => {
		console.log('num change create', num);
		return () => {
			console.log('num change destroy', num);
		};
	}, [num]);

	return (
		<div onClick={() => updateNum(num + 1)}>
			{num === 0 ? <Child /> : 'noop'}
		</div>
	);
};

function Child() {
	useEffect(() => {
		console.log('Child mount');
		return () => console.log('Child unmount');
	}, []);

	return 'i am child';
}

const root = document.getElementById('root') as HTMLElement;
ReactDOM.createRoot(root).render(<App />);

// console.log(React);
// console.log(jsx);
// console.log(ReactDOM);
