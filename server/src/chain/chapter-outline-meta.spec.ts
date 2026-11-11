import { describe, expect, it } from 'vitest';
import { sanitizeOutlineMetaReferences } from './chain.controller';

describe('sanitizeOutlineMetaReferences', () => {
  it('maps chapter numbers relative to the current chapter', () => {
    expect(sanitizeOutlineMetaReferences('和第1章临走时搁的位置一样，留到第4章再交。', 2))
      .toBe('和前文临走时搁的位置一样，留到后续再交。');
    expect(sanitizeOutlineMetaReferences('本章不解释，第2章已经确认。', 2))
      .toBe('这一段不解释，这一段已经确认。');
  });
  it('removes creation terms from prose-facing text', () => {
    expect(sanitizeOutlineMetaReferences('读者能看出作者在这里埋了大纲里的剧情。', 2))
      .toBe('旁人能看出人在这里埋了计划里的事情。');
  });
});
