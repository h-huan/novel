/**
 * Fail a clean build if any runtime TS module lacks its emitted JS artifact.
 * Reuse the same one-to-one source/output validator used at runtime: no
 * duplicated file manifests that drift as modules are added.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const serverRoot = path.resolve(__dirname, '..');
const distRoot = path.join(serverRoot, 'dist', 'src');
const entry = path.join(distRoot, 'main.js');
const moduleEntry = path.join(distRoot, 'app.module.js');
const checker = path.join(distRoot, 'build-freshness.js');

for (const artifact of [checker, moduleEntry, entry]) {
  if (!fs.existsSync(artifact)) {
    throw new Error('[build] 缺少必需构建产物：' + path.relative(serverRoot, artifact)
      + '；构建已阻断，请勿启动残缺后端。');
  }
}
const { findStaleBuildArtifact } = require(checker);
const stale = findStaleBuildArtifact(serverRoot);
if (stale) {
  throw new Error('[build] 构建产物' + (stale.missing ? '缺失' : '过期')
    + '：' + path.relative(serverRoot, stale.artifact)
    + '（源码：' + path.relative(serverRoot, stale.source) + '）；已阻断启动。');
}
// Exercise the precise CommonJS relative import that failed in the field.
// Resolving does not initialize Nest or access user databases.
createRequire(moduleEntry).resolve('./common/creation-context.middleware');
console.log('[build] 运行时构建产物完整性检查通过');
