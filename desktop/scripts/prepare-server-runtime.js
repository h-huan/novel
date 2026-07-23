const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(desktopRoot, '..', 'server');
const stageRoot = path.join(desktopRoot, 'packaging-resources', 'server-runtime');
const stageModules = path.join(stageRoot, 'node_modules');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  throw new Error(`Desktop runtime packaging requires Node.js 22+, current=${process.versions.node}`);
}
if (!fs.existsSync(path.join(serverRoot, 'dist', 'src', 'main.js'))) {
  throw new Error('Server has not been built: server/dist/src/main.js is missing');
}

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(stageModules, { recursive: true });
fs.cpSync(path.join(serverRoot, 'dist'), stageRoot, { recursive: true });
fs.copyFileSync(path.join(serverRoot, 'package.json'), path.join(stageRoot, 'package.json'));
fs.copyFileSync(process.execPath, path.join(stageRoot, 'node.exe'));

const modelSource = path.join(serverRoot, 'data', 'models', 'bge-small-zh-v1.5-onnx');
const modelTarget = path.join(stageRoot, 'data', 'models', 'bge-small-zh-v1.5-onnx');
const modelFiles = [
  'config.json',
  'configuration.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.txt',
  path.join('onnx', 'model.onnx'),
];
for (const relativePath of modelFiles) {
  const source = path.join(modelSource, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Local embedding model file is missing: ${source}`);
  const target = path.join(modelTarget, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const copied = new Set();
const queue = [];
const enqueueDependencies = packageJson => {
  for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(packageJson[group] || {})) {
      if (!copied.has(name)) queue.push(name);
    }
  }
};
enqueueDependencies(JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8')));

while (queue.length > 0) {
  const name = queue.shift();
  if (copied.has(name)) continue;
  const sourceRoot = path.join(serverRoot, 'node_modules', ...name.split('/'));
  const packageJsonPath = path.join(sourceRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) continue;
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  copied.add(name);
  enqueueDependencies(packageJson);
  const targetRoot = path.join(stageModules, ...name.split('/'));
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    dereference: true,
    filter(source) {
      const normalized = source.replace(/\\/g, '/');
      if (normalized.includes('/.git/')) return false;
      if (normalized.includes('/onnxruntime-node/bin/napi-v6/')) {
        return !/\/onnxruntime-node\/bin\/napi-v6\/(darwin|linux|win32\/arm64)(\/|$)/.test(normalized);
      }
      return true;
    },
  });
}

const stagedBytes = fs.readdirSync(stageRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .reduce((total, entry) => total + fs.statSync(path.join(entry.parentPath, entry.name)).size, 0);
console.log(`Prepared standalone server runtime: ${copied.size} packages, ${(stagedBytes / 1024 / 1024).toFixed(1)} MB`);
