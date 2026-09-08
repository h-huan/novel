import { Injectable } from '@nestjs/common';
import { getLocalEmbeddingModelPath, hasLocalEmbeddingModel, LOCAL_EMBEDDING_MODEL_NAME } from './local-embedding';

export interface EmbeddingAvailability {
  available: boolean;
  reason?: string;
  model?: string;
}

/** Optional local semantic index. Core writing context always comes from canonical project data. */
@Injectable()
export class EmbeddingService {
  private localPipeline: Promise<any> | null = null;

  getAvailability(): EmbeddingAvailability {
    return hasLocalEmbeddingModel()
      ? { available: true, model: LOCAL_EMBEDDING_MODEL_NAME }
      : { available: false, reason: 'Bundled local semantic-index model is unavailable' };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const availability = this.getAvailability();
    if (!availability.available) throw new Error(availability.reason);
    return this.embedLocally(texts);
  }

  private async embedLocally(texts: string[]): Promise<number[][]> {
    if (!hasLocalEmbeddingModel()) throw new Error('Local embedding model files are incomplete');
    if (!this.localPipeline) {
      this.localPipeline = (async () => {
        const transformers = require('@huggingface/transformers') as typeof import('@huggingface/transformers');
        transformers.env.allowRemoteModels = false;
        transformers.env.allowLocalModels = true;
        return transformers.pipeline('feature-extraction', getLocalEmbeddingModelPath(), {
          local_files_only: true,
          dtype: 'fp32',
        });
      })().catch(error => {
        this.localPipeline = null;
        throw error;
      });
    }

    const extractor = await this.localPipeline;
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 16) {
      const batch = texts.slice(offset, offset + 16);
      const output = await extractor(batch, { pooling: 'cls', normalize: true });
      const rows = output.tolist() as number[][];
      vectors.push(...rows);
    }
    const dimension = vectors[0]?.length || 0;
    if (vectors.length !== texts.length || dimension !== 512
      || vectors.some(vector => vector.length !== dimension || vector.every(value => value === 0))) {
      throw new Error(`Local embedding model returned invalid vectors: count=${vectors.length}, dimension=${dimension}`);
    }
    return vectors;
  }
}
