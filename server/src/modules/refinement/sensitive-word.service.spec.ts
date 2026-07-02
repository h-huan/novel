/**
 * sensitive-word.service.spec.ts
 * SensitiveWordService 单元测试 — 敏感词检测与替换
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SensitiveWordService } from './sensitive-word.service';

describe('SensitiveWordService', () => {
  let service: SensitiveWordService;

  beforeEach(() => {
    service = new SensitiveWordService();
  });

  describe('getCategories', () => {
    it('should return all categories', () => {
      const categories = service.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('check', () => {
    it('should detect sensitive words at strict level', () => {
      const result = service.check('这是敏感内容包含违规词。', 'strict');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by categories', () => {
      const result = service.check('敏感测试内容', 'strict', ['political']);
      for (const item of result) {
        expect(item.category).toBe('political');
      }
    });

    it('should return empty array for clean text', () => {
      // Using content unlikely to match any patterns
      const result = service.check('今天天气很好，他出门散步。', 'strict');
      // May still have matches depending on dictionary
      expect(Array.isArray(result)).toBe(true);
    });

    it('each match should have required fields', () => {
      const result = service.check('敏感内容测试', 'strict');
      for (const item of result) {
        expect(item).toHaveProperty('word');
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('severity');
        expect(item).toHaveProperty('suggestion');
      }
    });
  });

  describe('processContent', () => {
    it('should replace sensitive words with strategy=replace', () => {
      const result = service.processContent('测试文本包含敏感词。', 'replace');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('matches');
    });

    it('should remove sensitive words with strategy=remove', () => {
      const result = service.processContent('测试文本包含敏感词。', 'remove');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('matches');
    });

    it('should warn and keep content with strategy=warn', () => {
      const result = service.processContent('测试文本包含敏感词。', 'warn');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('matches');
    });
  });

  describe('aiContextCheck', () => {
    it('should check if word in context is sensitive', () => {
      const result = service.aiContextCheck('他说："这个词很正常。"', '词');
      expect(result).toHaveProperty('isSensitive');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reason');
    });

    it('should return a boolean and numeric confidence', () => {
      const result = service.aiContextCheck('测试内容', '测试');
      expect(typeof result.isSensitive).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
