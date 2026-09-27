import { describe, expect, it } from 'vitest';
import { ideaTimeConflict } from './idea-fact-consistency';

describe('idea fact consistency', () => {
  it('rejects conflicting time claims across hook and description', () => {
    expect(ideaTimeConflict({ hook: '每进一次现实倒退一小时', description: '时间回到三小时前' })).toBe(true);
  });

  it('accepts matching claims and cards without a numeric time rule', () => {
    expect(ideaTimeConflict({ hook: '每进一次现实倒退一小时', description: '时间回到一小时前' })).toBe(false);
    expect(ideaTimeConflict({ hook: '门后是旧楼', description: '三天后爆破' })).toBe(false);
  });
});
