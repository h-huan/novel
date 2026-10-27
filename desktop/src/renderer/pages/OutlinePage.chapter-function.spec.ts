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
  it('manual blank chapter placeholders do not assert a numbered narrative beat', () => {
    expect(source.match(/chapterFunction: 'paving',/g)).toHaveLength(2);
  });
});
