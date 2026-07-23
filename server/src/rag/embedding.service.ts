import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ModelRouterService } from '../routing/model-router.service';
import { getLocalEmbeddingModelPath, hasLocalEmbeddingModel, LOCAL_EMBEDDING_MODEL_NAME } from './local-embedding';

export interface EmbeddingAvailability {
  available: boolean;
  reason?: string;
  model?: string;
}

/** Real OpenAI-compatible embedding provider. Never returns placeholder vectors. */
@Injectable()
export class EmbeddingService {
  private localPipeline: Promise<any> | null = null;

  constructor(private readonly modelRouter: ModelRouterService) {}

  getAvailability(): EmbeddingAvailability {
    const config = this.resolveConfig();
    if (!config.apiKey && hasLocalEmbeddingModel()) return { available: true, model: LOCAL_EMBEDDING_MODEL_NAME };
    if (!config.apiKey) return { available: false, reason: 'No remote embedding service or local embedding model is available' };
    if (!config.model) return { available: false, reason: 'No embedding model is configured' };
    return { available: true, model: config.model };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const config = this.resolveConfig();
    const availability = this.getAvailability();
    if (!availability.available) throw new Error(availability.reason);

    if (!config.apiKey) return this.embedLocally(texts);

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 0,
      timeout: 120_000,
    });
    const response = await client.embeddings.create({ model: config.model!, input: texts });
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    if (vectors.length !== texts.length) {
      throw new Error(`Embedding count mismatch: expected ${texts.length}, received ${vectors.length}`);
    }
    const dimension = vectors[0]?.length || 0;
    if (!dimension || vectors.some((vector) => vector.length !== dimension || vector.every((value) => value === 0))) {
      throw new Error('Embedding provider returned an invalid or zero vector');
    }
    return vectors;
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

  private resolveConfig(): { apiKey: string; baseUrl: string; model?: string } {
    const embeddingConfig = this.modelRouter.getUserKey('global', 'embedding');
    const userConfig = this.modelRouter.getUserKey('global', 'openai');
    const baseUrl = (process.env.EMBEDDING_BASE_URL || embeddingConfig?.baseUrl || userConfig?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    return {
      apiKey: process.env.EMBEDDING_API_KEY || embeddingConfig?.apiKey || userConfig?.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl,
      model: process.env.EMBEDDING_MODEL || embeddingConfig?.embeddingModel || 'text-embedding-3-small',
    };
  }
}
