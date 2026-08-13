const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const source = path.join(root, 'node_modules', 'swup', 'dist', 'Swup.umd.js');
const target = path.join(root, 'themes', 'paper-moments', 'source', 'js', 'vendor', 'swup.min.js');

if (!fs.existsSync(source)) {
  throw new Error(`未找到 Swup 浏览器构建产物: ${source}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
