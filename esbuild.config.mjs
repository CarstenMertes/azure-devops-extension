import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');

const tasks = [
    'download',
    'install-analyzers',
    'detect-tfm-bc-artifact',
    'detect-tfm-nuget-devtools',
    'detect-tfm-marketplace',
];

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
    external: [],
};

await Promise.all(
    tasks.map((task) =>
        esbuild.build({
            ...sharedOptions,
            entryPoints: [`tasks/${task}/src/index.ts`],
            outfile: `tasks/${task}/dist/index.js`,
        }),
    ),
);
