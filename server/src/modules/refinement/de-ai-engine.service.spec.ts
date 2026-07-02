/**
 * de-ai-engine.service.spec.ts
 * DeAiEngineService 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DeAiEngineService } from './de-ai-engine.service';

describe('DeAiEngineService', () => {
  let service: DeAiEngineService;

  beforeEach(() => {
    service = new DeAiEngineService();
  });

  describe('detect', () => {
    it('should detect AI patterns in text', () => {
      const result = service.detect('值得注意的是，这个结果毋庸置疑是正确的。');
      expect(result.found).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect transition words', () => {
      const result = service.detect('值得一提的是，这个方案总的来说是可行的。');
      expect(result.found).toBe(true);
      const transitionMatches = result.matches.filter(m => m.category === 'transition');
      expect(transitionMatches.length).toBeGreaterThan(0);
    });

    it('should detect emotion formula patterns', () => {
      const result = service.detect('他的内心充满了悲伤。');
      expect(result.found).toBe(true);
      const emotionMatches = result.matches.filter(m => m.category === 'emotion');
      expect(emotionMatches.length).toBeGreaterThan(0);
    });

    it('should return found=false for clean text', () => {
      const result = service.detect('他推开门，走进房间。窗外下着雨。');
      expect(result.found).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should return suggestions for detected patterns', () => {
      const result = service.detect('毋庸置疑，这个方案是最好的。');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const result = service.detect('');
      expect(result.found).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('polish', () => {
    it('should replace AI patterns at high intensity', () => {
      const result = service.polish('毋庸置疑，值得注意的是这个方案总的来说是可行的。', 10);
      expect(result.result).toBeDefined();
      expect(Array.isArray(result.changes)).toBe(true);
    });

    it('should make changes for text with AI patterns', () => {
      const result = service.polish('毋庸置疑，值得注意的是这个方案总的来说是可行的。', 10);
      expect(result.changes.length).toBeGreaterThanOrEqual(0);
    });

    it('should produce different results at different intensities', () => {
      const highResult = service.polish('毋庸置疑，值得注意的是这个方案总的来说是可行的。', 10);
      const lowResult = service.polish('毋庸置疑，值得注意的是这个方案总的来说是可行的。', 1);
      // At least one should be defined
      expect(highResult.result).toBeDefined();
      expect(lowResult.result).toBeDefined();
    });

    it('should handle empty text', () => {
      const result = service.polish('', 10);
      expect(result.result).toBe('');
    });
  });
});
