/**
 * refinement-templates.service.spec.ts
 * RefinementTemplatesService 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RefinementTemplatesService } from './refinement-templates.service';

describe('RefinementTemplatesService', () => {
  let service: RefinementTemplatesService;

  beforeEach(() => {
    service = new RefinementTemplatesService();
  });

  describe('findAll', () => {
    it('should return all templates', () => {
      const templates = service.findAll();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const styleTemplates = service.findAll('style');
      expect(styleTemplates.every(t => t.category === 'style')).toBe(true);
    });

    it('should filter by dialogue category', () => {
      const dialogueTemplates = service.findAll('dialogue');
      expect(dialogueTemplates.every(t => t.category === 'dialogue')).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return template by id', () => {
      const template = service.findById('concise');
      expect(template).toBeDefined();
      expect(template!.id).toBe('concise');
    });

    it('should return undefined for unknown id', () => {
      const template = service.findById('nonexistent');
      expect(template).toBeUndefined();
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', () => {
      const categories = service.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('applyTemplate', () => {
    it('should apply rules to content for a known template', () => {
      const result = service.applyTemplate('concise', '他的心里感到非常难过和悲伤');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should throw for unknown template', () => {
      expect(() => service.applyTemplate('nonexistent', 'test')).toThrow();
    });

    it('should remove "非常" in concise mode', () => {
      const result = service.applyTemplate('concise', '他非常生气');
      expect(result).not.toContain('非常');
    });
  });

  describe('getAppliedRules', () => {
    it('should return rules for a known template', () => {
      const rules = service.getAppliedRules('concise');
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should throw for unknown template', () => {
      expect(() => service.getAppliedRules('nonexistent')).toThrow();
    });
  });

  describe('applyTemplates', () => {
    it('should apply multiple templates in sequence', () => {
      const result = service.applyTemplates(['concise'], '他的心里感到非常难过和悲伤');
      expect(typeof result).toBe('string');
    });
  });
});
