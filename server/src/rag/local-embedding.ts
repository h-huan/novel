import { existsSync } from 'fs';
import { resolve } from 'path';

export const LOCAL_EMBEDDING_MODEL_NAME = 'local:bge-small-zh-v1.5-qint8';

export function getLocalEmbeddingModelPath(): string {
  return resolve(
    process.env.LOCAL_EMBEDDING_MODEL_DIR
      || resolve(process.cwd(), 'data', 'models', 'bge-small-zh-v1.5-onnx'),
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
