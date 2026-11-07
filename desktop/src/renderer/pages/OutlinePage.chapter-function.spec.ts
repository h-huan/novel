import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// ARCH-004: read, AI candidate/save and manual drafts must never infer a chapter's
// narrative responsibility from order; explicit functions survive round trips.
const source = readFileSync(join(process.cwd(), 'src/renderer/pages/OutlinePage.tsx'), 'utf8');
describe('outline chapter responsibilities use explicit sources', () => {
  it('does not retain the old position-based short rhythm or repeating six-step cycle', () => {
    expect(source).not.toContain('inferRhythmByOrder');
    expect(source).not.toContain('shortRhythm');
    expect(source).not.toContain('const cycle: ChapterFunctionType[]');
  });
  it('preserves an explicit chapter function when reading or saving an AI outline', () => {
    expect(source).toContain('chapterFunction: normalizedFunction,');
    expect(source).toContain('chapterFunction: normalizeFunction(chapter.chapterFunction),');
    expect(source).toContain('chapterFunction: normalizeFunction(chapter.chapterFunction || chapter.function),');
  });
  it('prevents duplicate independent planning before model execution and before save', () => {
    expect(source).toContain('await assertIndependentOutlineDestinationEmpty();');
    expect(source.split('await assertIndependentOutlineDestinationEmpty();')).toHaveLength(3);
  });
  it('places long-form refill controls in the chapter list, not selected chapter details', () => {
    const detailStart = source.indexOf('const renderDetail = () =>');
    const browseStart = source.indexOf("activeView === 'browse' &&");
    const controls = source.indexOf('补充后续详细大纲', browseStart);
    const detail = source.slice(detailStart, browseStart);
    expect(controls).toBeGreaterThan(browseStart);
    expect(detail).not.toContain('立即滚动补纲');
    expect(detail).not.toContain('openContinueDialog');
    expect(source).toContain('aria-label="选择补充章数"');
    expect(source).toContain('onClick={() => handleRolloutOutline(rolloutAppendCount)}');
    expect(source).toContain('useState<1 | 3 | 5 | 10>(3)');
    for (const n of [1, 3, 5, 10]) expect(source).toContain(`<option value={${n}}>${n} 章</option>`);
    expect(source).not.toContain('([1, 3, 5, 10] as const).map(count =>');
  });
  it('does not mislabel chapter rows as the whole-book structure', () => {
    const browse=source.slice(source.indexOf("activeView === 'browse' &&"));
    expect(browse).toContain('全书骨架 · 世界观／主线与分卷／人物势力／伏笔／时间线');
    expect(browse).toContain('章节列表（已生成的详细章纲）');
    expect(browse).not.toContain('全书骨架 · 章节列表');
    expect(browse).toContain('全书分卷规划');
    expect(browse).toContain('选择补充章数');
  });
  it('sends an exact manual chapter count to the existing audited rollout route', () => {
    const handler = source.slice(source.indexOf('const handleRolloutOutline = useCallback('), source.indexOf('const openInsertDialog = useCallback('));
    expect(handler).toContain("api.post('/chain/rollout-outline', { projectId, appendCount })");
    expect(handler).toContain('if (data?.added !== appendCount)');
    expect(handler).not.toContain('selectedChapter');
    expect(source).not.toContain('handleContinueCreate');
  });

  it('manual blank chapter placeholders do not assert a numbered narrative beat', () => {
    expect(source.match(/chapterFunction: 'paving',/g)).toHaveLength(2);
  });
});
