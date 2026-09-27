import { existsSync } from 'fs';
import { resolve } from 'path';
import { resolveDataDir } from '../config/data-dir';

export const LOCAL_EMBEDDING_MODEL_NAME = 'local:bge-small-zh-v1.5-qint8';

// ⚠️ 防复发：这里曾是 resolve(process.cwd(), 'data', ...)，会随 cwd 漂移指向
// 另一个数据目录（本地向量模型因此可能"时有时无"）。数据目录一律走 resolveDataDir()。
export function getLocalEmbeddingModelPath(): string {
  return resolve(
    process.env.LOCAL_EMBEDDING_MODEL_DIR
      || resolve(resolveDataDir(), 'models', 'bge-small-zh-v1.5-onnx'),
  );
}

export function hasLocalEmbeddingModel(): boolean {
  const root = getLocalEmbeddingModelPath();
  return [
    resolve(root, 'config.json'),
    resolve(root, 'tokenizer.json'),
    resolve(root, 'onnx', 'model.onnx'),
  ].every(existsSync);
}
