// After tsc: mark dist/cjs as CommonJS and give the ESM build an import.meta.url-based moduleDir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(path.join(root, 'dist/cjs/package.json'), '{ "type": "commonjs" }\n');
fs.writeFileSync(path.join(root, 'dist/esm/package.json'), '{ "type": "module" }\n');
fs.writeFileSync(
  path.join(root, 'dist/esm/here.js'),
  "import { fileURLToPath } from 'node:url';\n" +
    "export const moduleDir = fileURLToPath(new URL('.', import.meta.url));\n",
);
