import React from 'react';
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
// import App from "./App.js";
// const root = ReactDOM.createRoot(document.getElementById("root"));
// root.render(<App />);

const App = () => {
	const [num, setNum] = useState(3);
	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];

	return (
		<ul onClickCapture={() => setNum(num + 1)}>
			<li key="1">1</li>
			<li key="2">2</li>
		</ul>
	);
};

const Child = () => {
	return <div>big-react</div>;
};

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(<App />);

// console.log(React);
// console.log(jsx);
// console.log(ReactDOM);
