/**
 * spell-check.service.spec.ts
 * SpellCheckService 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SpellCheckService } from './spell-check.service';

describe('SpellCheckService', () => {
  let service: SpellCheckService;

  beforeEach(() => {
    // 先清空持久化文件，再创建服务
    const fs = require('fs');
    const p = require('path');
    const dictPath = p.join(process.cwd(), 'data', 'custom-spell-dictionary.json');
    if (fs.existsSync(dictPath)) fs.unlinkSync(dictPath);
    service = new SpellCheckService();
  });

  describe('check', () => {
    it('should detect typo: 在/再 confusion', () => {
      const errors = service.check('我在说一遍。');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.word === '在' && e.suggestion?.includes('再'))).toBe(true);
    });

    it('should detect grammar: 的/得 confusion', () => {
      const errors = service.check('他跑的真快。', 'grammar');
      const grammarErrors = errors.filter(e => e.type === 'grammar');
      expect(grammarErrors.length).toBeGreaterThan(0);
    });

    it('should detect idiom typos', () => {
      const errors = service.check('按步就班地工作', 'typo');
      expect(errors.some(e => e.word === '按步就班')).toBe(true);
    });

    it('should return no errors for clean text', () => {
      const errors = service.check('他推开门，走进了房间。');
      expect(errors.length).toBe(0);
    });

    it('should filter by mode: typo only', () => {
      const errors = service.check('他在说一遍。他的跑的快。', 'typo');
      expect(errors.every(e => e.type === 'typo')).toBe(true);
    });

    it('each error should have required fields', () => {
      const errors = service.check('我在说一遍。');
      if (errors.length > 0) {
        const err = errors[0];
        expect(err).toHaveProperty('index');
        expect(err).toHaveProperty('word');
        expect(err).toHaveProperty('type');
        expect(err).toHaveProperty('suggestion');
        expect(err).toHaveProperty('context');
      }
    });
  });

  describe('batchFix', () => {
    it('should apply fixes at given indices', () => {
      const errors = service.check('我在说一遍。');
      if (errors.length > 0) {
        const result = service.batchFix('我在说一遍。', [{ index: errors[0].index, replacement: '再' }]);
        expect(result).toContain('再说一遍');
      }
    });

    it('should return original if no fixes match', () => {
      const result = service.batchFix('测试内容', []);
      expect(result).toBe('测试内容');
    });
  });

  describe('autoFix', () => {
    it('should auto-fix all detected errors', () => {
      const result = service.autoFix('我在说一遍。他做的很好。');
      expect(result.fixes.length).toBeGreaterThan(0);
      expect(result.result).not.toBe('我在说一遍。他做的很好。');
    });

    it('should make no changes for clean text', () => {
      const result = service.autoFix('他推开门，走进了房间。');
      expect(result.fixes.length).toBe(0);
      expect(result.result).toBe('他推开门，走进了房间。');
    });
  });

  describe('custom dictionary CRUD', () => {
    it('addToDictionary should add a custom entry', () => {
      service.addToDictionary('测试错字', '测试正字', 'typo', '测试用');
      const errors = service.check('这是个测试错字');
      expect(errors.some(e => e.word === '测试错字')).toBe(true);
    });

    it('addToDictionary should reject duplicates', () => {
      service.addToDictionary('测试错字', '测试正字', 'typo', '测试用');
      expect(() => service.addToDictionary('测试错字', '另一个', 'typo', '重复')).toThrow();
    });

    it('removeFromDictionary should remove a custom entry', () => {
      service.addToDictionary('要删除的', '保留', 'typo', '测试');
      const removed = service.removeFromDictionary('要删除的');
      expect(removed).toBe(true);
      const errors = service.check('要删除的这个词');
      expect(errors.some(e => e.word === '要删除的')).toBe(false);
    });

    it('removeFromDictionary should return false for non-existent', () => {
      expect(service.removeFromDictionary('不存在的')).toBe(false);
    });

    it('getCustomEntries should return only custom entries', () => {
      service.addToDictionary('自定义1', '正确1', 'typo', '测试');
      service.addToDictionary('自定义2', '正确2', 'typo', '测试');
      const entries = service.getCustomEntries();
      expect(entries.length).toBe(2);
    });

    it('getDictionarySize should count built-in + custom', () => {
      const before = service.getDictionarySize();
      service.addToDictionary('新增词', '正确词', 'typo', '测试');
      expect(service.getDictionarySize()).toBe(before + 1);
    });
  });
});
