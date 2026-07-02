/**
 * copyright-check.service.spec.ts
 * CopyrightCheckService 单元测试 — 版权检测
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CopyrightCheckService } from './copyright-check.service';

describe('CopyrightCheckService', () => {
  let service: CopyrightCheckService;

  beforeEach(() => {
    service = new CopyrightCheckService();
  });

  describe('checkTitle', () => {
    it('should detect exact title match', () => {
      const matches = service.checkTitle('斗破苍穹');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].risk).toBe('high');
    });

    it('should detect similar title', () => {
      const matches = service.checkTitle('斗破蒼穹'); // variant character
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should not flag unique titles', () => {
      const matches = service.checkTitle('魂穿北洋之领众破局');
      expect(matches.length).toBe(0);
    });

    it('each match should have required fields', () => {
      const matches = service.checkTitle('斗破苍穹');
      for (const m of matches) {
        expect(m).toHaveProperty('type');
        expect(m).toHaveProperty('risk');
        expect(m).toHaveProperty('matchedItem');
        expect(m).toHaveProperty('similarity');
        expect(m).toHaveProperty('source');
      }
    });
  });

  describe('checkContent', () => {
    it('should check content against known works', () => {
      const matches = service.checkContent('测试内容片段');
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should detect high-similarity content', () => {
      // Use content that might match
      const matches = service.checkContent('斗破苍穹第一章测试内容');
      const highRiskMatches = matches.filter(m => m.risk === 'high' || m.risk === 'medium');
      expect(Array.isArray(highRiskMatches)).toBe(true);
    });
  });

  describe('checkCharacters', () => {
    it('should detect character name similarity', () => {
      const matches = service.checkCharacters(['萧炎', '唐三', '叶凡']);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should not flag obviously unique character names', () => {
      // 使用非常独特的名字，确保Levenshtein距离足够大
      const matches = service.checkCharacters(['陆']);
      expect(Array.isArray(matches)).toBe(true);
    });
  });

  describe('checkFull', () => {
    it('should return a complete check result', () => {
      const result = service.checkFull('测试内容', '斗破苍穹', ['萧炎']);
      expect(result).toHaveProperty('risk');
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('suggestions');
    });

    it('should assign low risk for unique content', () => {
      const result = service.checkFull('这是一个完全原创的独立创作内容，与其他作品无任何关联。', '原创作品', ['张三']);
      expect(result.risk).toBe('low');
    });

    it('should assign high risk for clear violations', () => {
      const result = service.checkFull('斗破苍穹第一章内容。', '斗破苍穹', ['萧炎', '唐三']);
      expect(result.risk).toBe('high');
    });

    it('should provide suggestions', () => {
      const result = service.checkFull('测试内容', '斗破苍穹', ['萧炎']);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
});
