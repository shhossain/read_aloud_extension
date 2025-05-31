import typescript from '@rollup/plugin-typescript';

export default [
    {
        input: 'src/index.ts',
        output: {
            file: 'dist/bundle.js',
            format: 'iife',
            sourcemap: true
        },
        plugins: [typescript()],
    },
    {
        input: 'src/popup.ts',
        output: {
            file: 'dist/popup.js',
            format: 'iife',
            sourcemap: true
        },
        plugins: [typescript()],
    },
    {
        input: 'src/background.ts',
        output: {
            file: 'dist/background.js',
            format: 'iife',
            sourcemap: true
        },
        plugins: [typescript()],
    }
];