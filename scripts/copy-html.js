const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const outDir = path.join(__dirname, '..', 'dist', 'renderer');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));
console.log('Copied index.html -> dist/renderer/');
