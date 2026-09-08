import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { CreateProjectDto } from './dto/create-project.dto';
import { readConstitution, updateConstitution, constitutionColumns } from './creative-constitution';

describe('creative constitution boundary', () => {
  it('builds the constitution only from canonical project fields', () => {
    const dto = plainToInstance(CreateProjectDto, { title: 'test', type: 'short_story', targetPlatform: 'zhihu' });
    const c = updateConstitution({ settings: '{}' }, dto);
    expect(c).toMatchObject({ projectType: 'short_story', targetPlatform: 'zhihu' });
    expect(c.chapterWordRange).toEqual({ min: 1500, max: 8000 });
  });
  it('uses a saved constitution even when old mirrors disagree', () => {
    const c = updateConstitution({}, { targetPlatform: 'fanqie', storyTone: ['热血'], pov: '第一人称' });
    const row = constitutionColumns({}, c);
    expect(readConstitution({ ...row, target_platform: 'zhihu', type: 'short_story' })).toEqual(c);
  });
  it('rejects duplicate settings sources and invalid configuration', () => {
    expect(() => updateConstitution({}, { targetPlatform: 'fanqie', settings: { targetPlatform: 'zhihu' } })).toThrow('必须使用创作宪法字段');
    expect(() => readConstitution({ settings: 'broken' })).toThrow('JSON');
    expect(() => readConstitution({ settings: { creativeConstitution: { schemaVersion: 1, revision: 1 } } })).toThrow('创作宪法');
    expect(() => updateConstitution({}, { chapterWordRange: { min: 4000, max: 1000 } })).toThrow();
  });
  it('increments revision only when creative fields change and permits clearing tags', () => {
    const c = updateConstitution({}, { storyTone: ['热血'], writingStyle: ['白描'] });
    const row = constitutionColumns({}, c);
    expect(updateConstitution(row, { title: 'rename' }).revision).toBe(c.revision);
    expect(updateConstitution(row, { storyTone: [] })).toMatchObject({ storyTone: [], revision: c.revision + 1 });
  });
  it('never promotes an idea recommendation into the selected platform', () => {
    expect(readConstitution({ settings: JSON.stringify({ recommendedPlatform: 'zhihu' }) }).targetPlatform).toBe('generic');
  });
});
