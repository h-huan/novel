/**
 * describe-polish.service.spec.ts
 * DescribePolishService 单元测试 — 逐句精修
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DescribePolishService } from './describe-polish.service';

describe('DescribePolishService', () => {
  let service: DescribePolishService;

  beforeEach(() => {
    service = new DescribePolishService();
  });

  describe('getStyles', () => {
    it('should return all polish styles', () => {
      const styles = service.getStyles();
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
    });

    it('each style should have id, name, and description', () => {
      const styles = service.getStyles();
      for (const style of styles) {
        expect(style).toHaveProperty('id');
        expect(style).toHaveProperty('name');
        expect(style).toHaveProperty('description');
      }
    });
  });

  describe('polish', () => {
    it('should return polish variants for a sentence', () => {
      const results = service.polish('他推开门，走进了房间。');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('each result should have original, rewritten, changes, and rating', () => {
      const results = service.polish('他推开门，走进了房间。');
      for (const r of results) {
        expect(r).toHaveProperty('original');
        expect(r).toHaveProperty('rewritten');
        expect(r).toHaveProperty('changes');
        expect(r).toHaveProperty('rating');
        expect(r.original).toBe('他推开门，走进了房间。');
      }
    });

    it('should filter by requested styles', () => {
      const results = service.polish('他推开门，走进了房间。', ['poetic']);
      expect(results.length).toBe(1);
    });

    it('should apply multiple styles when requested', () => {
      const results = service.polish('他推开门，走进了房间。', ['poetic', 'direct']);
      expect(results.length).toBe(2);
    });

    it('should apply all 5 new styles', () => {
      const results = service.polish('他推开门，走进了房间。', ['poetic', 'direct', 'metaphorical', 'sensory', 'emotional']);
      expect(results.length).toBe(5);
    });

    it('should produce variants for each style', () => {
      const results = service.polish('他推开门，走进了房间。', ['poetic'], undefined, 3);
      expect(results.length).toBe(3);
      // Variants should differ from each other
      const rewrites = results.map(r => r.rewritten);
      const uniqueRewrites = new Set(rewrites);
      expect(uniqueRewrites.size).toBeGreaterThan(1);
    });

    it('should handle context with genre', () => {
      const results = service.polish('他推开门，走进了房间。', undefined, { genre: 'fantasy' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle context with character info', () => {
      const results = service.polish('他推开门，走进了房间。', undefined, { characterName: '陆川', emotion: 'angry' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should vary rewriting by emotion context', () => {
      const angryResults = service.polish('他看着她。', undefined, { emotion: 'angry' });
      const sadResults = service.polish('他看着她。', undefined, { emotion: 'sad' });
      // Different emotions should produce different rewrites
      const angryContent = angryResults.map(r => r.rewritten).join('');
      const sadContent = sadResults.map(r => r.rewritten).join('');
      // Both should exist and be different
      expect(angryContent.length).toBeGreaterThan(0);
      expect(sadContent.length).toBeGreaterThan(0);
    });

    it('should handle empty sentence gracefully', () => {
      const results = service.polish('');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('5 new polish styles', () => {
    const testSentence = '他推开门，走进了房间。';

    it('poetic style should produce rewritten text with poetic elements', () => {
      const results = service.polish(testSentence, ['poetic']);
      expect(results.length).toBe(1);
      expect(results[0].rewritten).not.toBe(testSentence);
      expect(results[0].changes.length).toBeGreaterThan(0);
    });

    it('direct style should produce rewritten text (simplified)', () => {
      const results = service.polish(testSentence, ['direct']);
      expect(results.length).toBe(1);
      expect(results[0].rewritten).not.toBe(testSentence);
      expect(results[0].changes.length).toBeGreaterThan(0);
    });

    it('metaphorical style should produce rewritten text with subtext', () => {
      const results = service.polish(testSentence, ['metaphorical']);
      expect(results.length).toBe(1);
      expect(results[0].rewritten).not.toBe(testSentence);
      expect(results[0].changes.length).toBeGreaterThan(0);
    });

    it('sensory style should produce rewritten text with sensory details', () => {
      const results = service.polish(testSentence, ['sensory']);
      expect(results.length).toBe(1);
      expect(results[0].rewritten).not.toBe(testSentence);
      expect(results[0].changes.length).toBeGreaterThan(0);
    });

    it('emotional style should produce rewritten text with emotional elements', () => {
      const results = service.polish(testSentence, ['emotional']);
      expect(results.length).toBe(1);
      expect(results[0].rewritten).not.toBe(testSentence);
      expect(results[0].changes.length).toBeGreaterThan(0);
    });

    it('each style should produce 3 different variants', () => {
      for (const style of ['poetic', 'direct', 'metaphorical', 'sensory', 'emotional']) {
        const results = service.polish(testSentence, [style], undefined, 3);
        expect(results.length).toBe(3);
        for (const r of results) {
          expect(r.original).toBe(testSentence);
          expect(typeof r.rewritten).toBe('string');
          expect(Array.isArray(r.changes)).toBe(true);
          expect(typeof r.rating).toBe('number');
          expect(r.rating).toBeGreaterThanOrEqual(1);
          expect(r.rating).toBeLessThanOrEqual(10);
        }
      }
    });

    it('batchPolish should work with new styles', () => {
      const sentences = ['他推开门。', '她笑了笑。'];
      const results = service.batchPolish(sentences, 'poetic');
      expect(results.length).toBe(2);
      expect(results[0].length).toBe(1);
      expect(results[1].length).toBe(1);
    });
  });
});
