import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'

export default {
  input: 'js/main.js',
  output: { file: 'dist/main.js', format: 'iife', name: 'PaperApp', sourcemap: false },
  plugins: [
    replace({ preventAssignment: true, 'process.env.NODE_ENV': JSON.stringify('production') }),
    resolve({ browser: true, extensions: ['.js'] }),
    commonjs(),
  ],
}
