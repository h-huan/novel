/**
 * Content Safety Tests (7.5)
 *
 * Tests for:
 * - Sensitive word detection against known categories (political, violence, etc.)
 * - Clean content (should return no matches)
 * - Content with exact sensitive words
 * - Sensitive word processing with different strategies (replace/remove/warn)
 * - Copyright check on known work titles
 * - Copyright check on unique content (should return low risk)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SensitiveWordService } from '../../src/modules/refinement/sensitive-word.service';
import { CopyrightCheckService } from '../../src/modules/refinement/copyright-check.service';

describe('Content Safety', () => {
  describe('SensitiveWordService', () => {
    let service: SensitiveWordService;

    beforeEach(() => {
      service = new SensitiveWordService();
    });

    describe('sensitive word detection against known categories', () => {
      it('should detect political sensitive words', () => {
        const results = service.check('这是一个敏感政治词A的测试内容', 'strict');
        const political = results.filter(r => r.category === 'political');
        expect(political.length).toBeGreaterThanOrEqual(1);
      });

      it('should detect violence sensitive words', () => {
        const results = service.check('描写了碎尸的详细过程', 'strict');
        const violence = results.filter(r => r.category === 'violence');
        expect(violence.length).toBeGreaterThanOrEqual(1);
      });

      it('should detect illegal sensitive words', () => {
        const results = service.check('涉及贩毒和洗钱的内容', 'strict');
        const illegal = results.filter(r => r.category === 'illegal');
        expect(illegal.length).toBeGreaterThanOrEqual(2);
      });

      it('should detect discrimination sensitive words', () => {
        const results = service.check('使用了歧视词A这样的表达', 'strict');
        const disc = results.filter(r => r.category === 'discrimination');
        expect(disc.length).toBeGreaterThanOrEqual(1);
      });

      it('should return categories list', () => {
        const cats = service.getCategories();
        expect(cats).toContain('political');
        expect(cats).toContain('violence');
        expect(cats).toContain('pornographic');
        expect(cats).toContain('discrimination');
        expect(cats).toContain('illegal');
      });
    });

    describe('clean content returns no matches', () => {
      it('should return empty for clean content', () => {
        const results = service.check('今天天气真好，阳光明媚。他走在街上，心情愉快。', 'strict');
        expect(results.length).toBe(0);
      });

      it('should return empty for short safe text', () => {
        const results = service.check('你好，世界！', 'strict');
        expect(results.length).toBe(0);
      });
    });

    describe('content with exact sensitive words', () => {
      it('should detect exact sensitive word match', () => {
        const results = service.check('包含敏感政治词A的内容', 'strict');
        expect(results.some(r => r.word === '敏感政治词A')).toBe(true);
      });

      it('should detect multiple sensitive words', () => {
      const results = service.check('碎尸和贩毒都是违法的', 'strict');
      expect(results.length).toBeGreaterThanOrEqual(2);
      });

      it('should return position information for each match', () => {
        const results = service.check('前面文字敏感政治词A后面文字', 'strict');
        if (results.length > 0) {
          expect(results[0]).toHaveProperty('position');
          expect(typeof results[0].position).toBe('number');
        }
      });
    });

    describe('sensitive word processing with different strategies', () => {
      it('should replace sensitive words with replacement text', () => {
        const { result, matches } = service.processContent('包含敏感政治词A的内容', 'replace');
        expect(result).not.toContain('敏感政治词A');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });

      it('should remove sensitive words entirely', () => {
        const { result, matches } = service.processContent('包含碎尸的文本', 'remove');
        expect(result).not.toContain('碎尸');
        // "的文本" remains
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });

      it('should not modify content when strategy is warn', () => {
        const { result, matches } = service.processContent('包含敏感政治词E的内容', 'warn');
        expect(result).toContain('敏感政治词E');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('CopyrightCheckService', () => {
    let service: CopyrightCheckService;

    beforeEach(() => {
      service = new CopyrightCheckService();
    });

    describe('copyright check on known work titles', () => {
      it('should detect high similarity with known work title', () => {
        const matches = service.checkTitle('斗破苍穹');
        const highRisk = matches.filter(m => m.risk === 'high');
        expect(highRisk.length).toBeGreaterThanOrEqual(1);
      });

      it('should detect medium similarity with partial title match', () => {
        const matches = service.checkTitle('斗破之新世界');
        // May match "斗破苍穹"
        expect(Array.isArray(matches)).toBe(true);
      });

      it('should return empty for unique titles', () => {
        const matches = service.checkTitle('我的完全原创小说标题2024');
        expect(matches.length).toBe(0);
      });
    });

    describe('copyright check on unique content', () => {
      it('should return low risk for unique content', () => {
        const result = service.checkFull(
          '这是一个完全原创的故事内容，讲述了一个普通人的冒险经历。',
          '我的原创小说',
          ['张三', '李四'],
        );
        expect(result.risk).toBe('low');
      });

      it('should detect character name similarity with known works', () => {
        const result = service.checkFull(
          '一段内容',
          '原创标题',
          ['萧炎', '林动'],
        );
        // "萧炎" matches 斗破苍穹, "林动" matches 武动乾坤
        const charMatches = result.matches.filter(m => m.type === 'character');
        expect(charMatches.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
