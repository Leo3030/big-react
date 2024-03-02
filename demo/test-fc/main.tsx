import React from 'react';
import ReactDOM from 'react-dom/client';
// import App from "./App.js";
// const root = ReactDOM.createRoot(document.getElementById("root"));
// root.render(<App />);

const App = () => {
	return (
		<div>
			<span>big-react</span>
		</div>
	);
};

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(<App />);

console.log(React);
// console.log(jsx);
console.log(ReactDOM);
