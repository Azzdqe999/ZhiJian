import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const node = process.execPath
execFileSync(node, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
execFileSync(node, ['node_modules/rollup/dist/bin/rollup', '-c'], { stdio: 'inherit' })
fs.copyFileSync('src/styles.css', 'dist/styles.css')

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>纸间 · 本地小说阅读器</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./main.js"></script>
  </body>
</html>
`
fs.writeFileSync('dist/index.html', html)
console.log('build done')
