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
    expect(source).toContain('([1, 3, 5, 10] as const).map(count =>');
    expect(source).toContain('onClick={() => handleRolloutOutline(count)}');
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
