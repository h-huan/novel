/**
 * CharacterService.profileChanges 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharacterService } from './character.service';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import { DatabaseService } from '../../database/database.service';

const dbObj = {
  prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) })),
};
const db = { getDb: vi.fn(() => dbObj) } as unknown as DatabaseService;

const mkService = () => new CharacterService(
  {} as unknown as CharacterRepository,
  {} as unknown as CharacterStateRepository,
  db,
);

describe('CharacterService.profileChanges', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listProfileChanges 返回行', () => {
    (dbObj.prepare as any).mockReturnValue({ all: vi.fn(() => [{ id: 'c1', field_key: 'personality_traits', before_value: 'a', after_value: 'b' }]) });
    const rows = mkService().listProfileChanges('p1', 'char-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].field_key).toBe('personality_traits');
  });

  it('createProfileChange 写入并返回', () => {
    const run = vi.fn(); const get = vi.fn(() => ({ id: 'c1' }));
    (dbObj.prepare as any).mockReturnValue({ run, get });
    const out = mkService().createProfileChange('p1', 'char-1', { fieldKey: 'appearance', fieldLabel: '外貌特征', beforeValue: '', afterValue: 'new' });
    expect(run).toHaveBeenCalled();
    expect(out.id).toBe('c1');
  });

  it('deleteProfileChange 执行删除', () => {
    const run = vi.fn(); (dbObj.prepare as any).mockReturnValue({ run });
    mkService().deleteProfileChange('p1', 'char-1', 'c1');
    expect(run).toHaveBeenCalled();
  });
});
