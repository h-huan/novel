import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ModelRouterService } from '../routing/model-router.service';

export interface EmbeddingAvailability {
  available: boolean;
  reason?: string;
  model?: string;
}

/** Real OpenAI-compatible embedding provider. Never returns placeholder vectors. */
@Injectable()
export class EmbeddingService {
  constructor(private readonly modelRouter: ModelRouterService) {}

  getAvailability(): EmbeddingAvailability {
    const config = this.resolveConfig();
    if (!config.apiKey) return { available: false, reason: 'No embedding/OpenAI API key is configured' };
    if (!config.model) return { available: false, reason: 'No embedding model is configured' };
    return { available: true, model: config.model };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const config = this.resolveConfig();
    const availability = this.getAvailability();
    if (!availability.available) throw new Error(availability.reason);

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

  private resolveConfig(): { apiKey: string; baseUrl: string; model?: string } {
    const userConfig = this.modelRouter.getUserKey('global', 'openai');
    const baseUrl = (process.env.EMBEDDING_BASE_URL || userConfig?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    return {
      apiKey: process.env.EMBEDDING_API_KEY || userConfig?.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    };
  }
}
