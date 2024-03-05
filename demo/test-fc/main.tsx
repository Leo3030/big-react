import { useState } from 'react';
import ReactDOM from 'react-dom/client';
// import App from "./App.js";
// const root = ReactDOM.createRoot(document.getElementById("root"));
// root.render(<App />);

const App = () => {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return (
		<div>
			<span>{num}</span>
		</div>
	);
};

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(<App />);

// console.log(React);
// console.log(jsx);
console.log(ReactDOM);
