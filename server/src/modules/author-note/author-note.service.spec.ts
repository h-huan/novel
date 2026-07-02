/**
 * AuthorNoteService 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthorNoteService, type AuthorNoteRule } from './author-note.service';
import { AuthorNoteRuleType, AuthorNoteScope } from './dto/author-note.dto';

describe('AuthorNoteService', () => {
  let service: AuthorNoteService;

  beforeEach(() => {
    service = new AuthorNoteService();
  });

  describe('create', () => {
    it('should create a rule with default priority', () => {
      const rule = service.create({
        title: '主角不能死亡',
        ruleType: AuthorNoteRuleType.PLOT_CONSTRAINT,
        content: '主角在最终章之前不能死亡',
        scope: AuthorNoteScope.CHAPTER,
        chapterIndex: 5,
      });

      expect(rule.id).toBeDefined();
      expect(rule.title).toBe('主角不能死亡');
      expect(rule.ruleType).toBe(AuthorNoteRuleType.PLOT_CONSTRAINT);
      expect(rule.priority).toBe(90); // PLOT_CONSTRAINT 默认权重
      expect(rule.isActive).toBe(true);
    });

    it('should throw if chapterIndex missing for chapter scope', () => {
      expect(() =>
        service.create({
          title: '测试',
          ruleType: AuthorNoteRuleType.CUSTOM,
          content: '测试内容',
          scope: AuthorNoteScope.CHAPTER,
        }),
      ).toThrow('chapterIndex is required');
    });

    it('should create permanent scope rule', () => {
      const rule = service.create({
        title: '世界观设定',
        ruleType: AuthorNoteRuleType.SETTING_OVERRIDE,
        content: '魔法世界，存在魔法元素',
        scope: AuthorNoteScope.PERMANENT,
      });

      expect(rule.scope).toBe(AuthorNoteScope.PERMANENT);
      expect(rule.chapterIndex).toBeUndefined();
    });

    it('should accept custom priority', () => {
      const rule = service.create({
        title: '自定义优先级',
        ruleType: AuthorNoteRuleType.STYLE_REQUIREMENT,
        content: '文风要幽默',
        scope: AuthorNoteScope.PERMANENT,
        priority: 95,
      });

      expect(rule.priority).toBe(95);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      service.create({ title: '规则A', ruleType: AuthorNoteRuleType.PLOT_CONSTRAINT, content: '内容A', scope: AuthorNoteScope.PERMANENT });
      service.create({ title: '规则B', ruleType: AuthorNoteRuleType.STYLE_REQUIREMENT, content: '内容B', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1 });
      service.create({ title: '规则C', ruleType: AuthorNoteRuleType.SETTING_OVERRIDE, content: '内容C', scope: AuthorNoteScope.VOLUME, volumeIndex: 2 });
    });

    it('should return all rules', () => {
      const rules = service.findAll();
      expect(rules).toHaveLength(3);
    });

    it('should filter by scope', () => {
      const rules = service.findAll({ scope: AuthorNoteScope.PERMANENT });
      expect(rules).toHaveLength(1);
      expect(rules[0].title).toBe('规则A');
    });

    it('should filter by ruleType', () => {
      const rules = service.findAll({ ruleType: AuthorNoteRuleType.STYLE_REQUIREMENT });
      expect(rules).toHaveLength(1);
      expect(rules[0].title).toBe('规则B');
    });

    it('should return sorted by priority descending', () => {
      const rules = service.findAll();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });

  describe('findOne / update / remove', () => {
    it('should find a rule by id', () => {
      const created = service.create({
        title: '测试规则', ruleType: AuthorNoteRuleType.CUSTOM, content: '测试', scope: AuthorNoteScope.PERMANENT,
      });
      const found = service.findOne(created.id);
      expect(found.id).toBe(created.id);
    });

    it('should throw on not found', () => {
      expect(() => service.findOne('non-existent')).toThrow();
    });

    it('should update a rule', () => {
      const created = service.create({
        title: '旧标题', ruleType: AuthorNoteRuleType.CUSTOM, content: '旧内容', scope: AuthorNoteScope.PERMANENT,
      });
      const updated = service.update(created.id, { title: '新标题', content: '新内容' });
      expect(updated.title).toBe('新标题');
      expect(updated.content).toBe('新内容');
    });

    it('should remove a rule', () => {
      const created = service.create({
        title: '待删除', ruleType: AuthorNoteRuleType.CUSTOM, content: '待删除', scope: AuthorNoteScope.PERMANENT,
      });
      const result = service.remove(created.id);
      expect(result.success).toBe(true);
      expect(() => service.findOne(created.id)).toThrow();
    });
  });

  describe('conflict detection', () => {
    it('should detect locked chapter conflict for chapter scope', () => {
      const rule = service.create({
        title: '修改第1章', ruleType: AuthorNoteRuleType.SETTING_OVERRIDE,
        content: '修改设定', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1,
      });

      const conflict = service.detectConflicts(rule.id, ['locked-chapter-1']);
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflicts.some((c) => c.type === 'locked_chapter_conflict')).toBe(true);
    });

    it('should detect scope overlap', () => {
      service.create({
        title: '已有规则', ruleType: AuthorNoteRuleType.PLOT_CONSTRAINT,
        content: '已有内容', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1,
      });

      const newRule = service.create({
        title: '新规则', ruleType: AuthorNoteRuleType.STYLE_REQUIREMENT,
        content: '新风格', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1,
      });

      const conflict = service.detectConflicts(newRule.id, []);
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflicts.some((c) => c.type === 'scope_overlap')).toBe(true);
    });

    it('should not detect conflicts for non-overlapping rules', () => {
      const rule = service.create({
        title: '独立规则', ruleType: AuthorNoteRuleType.CUSTOM,
        content: '独立内容', scope: AuthorNoteScope.CHAPTER, chapterIndex: 10,
      });

      const conflict = service.detectConflicts(rule.id, []);
      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe('prompt injection', () => {
    it('should return empty prompt when no rules match', () => {
      const result = service.getInjectedPrompt({ chapterIndex: 1 });
      expect(result.rules).toHaveLength(0);
      expect(result.formattedPrompt).toBe('');
      expect(result.priority).toBe(0);
    });

    it('should return applicable rules for chapter scope', () => {
      service.create({
        title: '第1章规则', ruleType: AuthorNoteRuleType.STYLE_REQUIREMENT,
        content: '文风要求', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1,
      });
      service.create({
        title: '永久规则', ruleType: AuthorNoteRuleType.PLOT_CONSTRAINT,
        content: '永久约束', scope: AuthorNoteScope.PERMANENT,
      });

      const result = service.getInjectedPrompt({ chapterIndex: 1 });
      expect(result.rules).toHaveLength(2);
      expect(result.formattedPrompt).toContain('【作者注指令】');
      expect(result.priority).toBeGreaterThan(0);
    });

    it('should order chapter scope before permanent scope', () => {
      const chapterRule = service.create({
        title: '章节规则', ruleType: AuthorNoteRuleType.CUSTOM,
        content: '章节级', scope: AuthorNoteScope.CHAPTER, chapterIndex: 1, priority: 50,
      });
      service.create({
        title: '永久规则', ruleType: AuthorNoteRuleType.CUSTOM,
        content: '永久级', scope: AuthorNoteScope.PERMANENT, priority: 90,
      });

      const result = service.getInjectedPrompt({ chapterIndex: 1 });
      // 章节级作用域虽然在前面，但排序优先
      expect(result.rules[0].scope).toBe(AuthorNoteScope.CHAPTER);
    });

    it('should not include rules for other chapters', () => {
      service.create({
        title: '第2章专用', ruleType: AuthorNoteRuleType.CUSTOM,
        content: '仅第2章', scope: AuthorNoteScope.CHAPTER, chapterIndex: 2,
      });

      const result = service.getInjectedPrompt({ chapterIndex: 1 });
      expect(result.rules).toHaveLength(0);
    });
  });
});
