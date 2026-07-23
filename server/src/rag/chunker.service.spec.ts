import { describe, expect, it } from 'vitest';
import { ChunkerService } from './chunker.service';

describe('ChunkerService full-document indexing', () => {
  it('splits an oversized character profile without truncating its tail', () => {
    const content = `${'甲'.repeat(4500)}尾部关键设定`;
    const chunks = new ChunkerService().split(content, 'character_profile', 'character-1');

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map(item => item.text).join('')).toBe(content);
    expect(chunks.at(-1)?.text).toContain('尾部关键设定');
  });
});
