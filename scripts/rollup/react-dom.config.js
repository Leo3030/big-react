import { getPackageJson, resolvePkgPath, getBaseRollupPlugins } from './utils';
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';

const { name, module } = getPackageJson('react-dom');
// react-dom 包的路径
const pkgPath = resolvePkgPath(name);
// dist 路径
const distPath = resolvePkgPath(name, true);

export default [
	//react
	{
		input: `${pkgPath}/${module}`,
		output: [
			{
				file: `${distPath}/index.js`,
				name: 'index.js',
				format: 'umd'
			},
			{
				file: `${distPath}/client.js`,
				name: 'client.js',
				format: 'umd'
			}
		],
		plugins: [
			...getBaseRollupPlugins(),
			alias({
				entries: {
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: distPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
	//jsx-dev-runtime
	// {
	// 	input: `${pkgPath}/src/jsx.ts`,
	// 	output: [
	// 		{
	// 			file: `${distPath}/jsx-runtime.js`,
	// 			name: 'jsx-runtime.js',
	// 			format: 'umd'
	// 		},
	// 		{
	// 			file: `${distPath}/jsx-dev-runtime.js`,
	// 			name: 'jsx-dev-runtime.js',
	// 			format: 'umd'
	// 		}
	// 	],
	// 	plugins: getBaseRollupPlugins()
	// }
];
