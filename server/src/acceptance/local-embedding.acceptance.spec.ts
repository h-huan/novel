import { describe, expect, it } from 'vitest';
import { EmbeddingService } from '../rag/embedding.service';
import { LOCAL_EMBEDDING_MODEL_NAME } from '../rag/local-embedding';

describe('local Chinese embedding acceptance', () => {
  it('produces normalized non-zero semantic vectors without a remote API key', async () => {
    const router = { getUserKey: () => null };
    const service = new EmbeddingService(router as any);

    expect(service.getAvailability()).toEqual({ available: true, model: LOCAL_EMBEDDING_MODEL_NAME });
    const vectors = await service.embed(['小说人物关系', '故事角色联系', '天气晴朗']);

    expect(vectors).toHaveLength(3);
    expect(vectors.every(vector => vector.length === 512)).toBe(true);
    expect(vectors.every(vector => vector.some(value => value !== 0))).toBe(true);
    const dot = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * right[index], 0);
    expect(dot(vectors[0], vectors[1])).toBeGreaterThan(dot(vectors[0], vectors[2]));
  }, 30_000);
});
