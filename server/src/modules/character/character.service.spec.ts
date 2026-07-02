/**
 * CharacterService 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterService } from './character.service';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';

describe('CharacterService', () => {
  let service: CharacterService;
  let repo: CharacterRepository;
  let stateRepo: CharacterStateRepository;

  const mockRow = {
    id: 'char-1',
    project_id: 'project-1',
    name: '张三',
    aliases: '["阿三"]',
    age: 25,
    gender: '男',
    identity: '武林高手',
    appearance: '高大威猛',
    background: '出生武林世家',
    personality: '{"extraversion":80,"agreeableness":50,"conscientiousness":60,"neuroticism":30,"openness":70}',
    abilities: '{"剑法":90}',
    relationships: '[]',
    arc: '[]',
    dialogue_style: '粗犷直接',
    dialogue_patterns: '["哈哈哈","岂有此理"]',
    is_pov_character: 1,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  };

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProjectId: vi.fn(),
      findPovCharacters: vi.fn(),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
      search: vi.fn(),
    } as unknown as CharacterRepository;

    stateRepo = {
      getLatestState: vi.fn(),
      getStateHistory: vi.fn(),
      getByChapter: vi.fn(),
      getNeedingReview: vi.fn(),
      getNextSnapshotOrder: vi.fn(),
    } as unknown as CharacterStateRepository;

    service = new CharacterService(repo, stateRepo);
  });

  describe('create', () => {
    it('should create a character', () => {
      (repo.findById as any).mockReturnValue(mockRow);

      const result = service.create('project-1', {
        name: '张三',
        aliases: ['阿三'],
        age: 25,
        gender: '男',
        identity: '武林高手',
        isPovCharacter: true,
        dialogueStyle: '粗犷直接',
        dialoguePatterns: ['哈哈哈', '岂有此理'],
      });

      expect(result.name).toBe('张三');
      expect(result.isPovCharacter).toBe(true);
      expect(result.personality.extraversion).toBe(80);
    });
  });

  describe('relationships', () => {
    it('should add relationship', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      (repo.addRelationship as any).mockReturnValue({
        ...mockRow,
        relationships: '[{"targetCharacterId":"char-2","targetName":"李四","type":"friend","description":"好友","intensity":7,"history":[]}]',
      });

      const result = service.addRelationship('char-1', {
        targetCharacterId: 'char-2',
        targetName: '李四',
        type: 'friend',
        description: '好友',
        intensity: 7,
      });

      expect(result.relationships.length).toBe(1);
    });

    it('should remove relationship', () => {
      (repo.findById as any).mockReturnValue(mockRow);
      (repo.removeRelationship as any).mockReturnValue(mockRow);

      const result = service.removeRelationship('char-1', 'char-2');
      expect(result).toBeDefined();
    });
  });

  describe('state', () => {
    it('should get latest state', () => {
      (stateRepo.getLatestState as any).mockReturnValue({
        id: 'state-1',
        character_id: 'char-1',
        chapter_id: 'chapter-1',
        timestamp: '2025-01-01',
        snapshot_order: 1,
        states_json: '{"physical":{"health":90,"location":"京城"}}',
        changed_dimensions: '["physical"]',
        confidence: 0.95,
        needs_review: 0,
        created_by: 'system',
        created_at: '2025-01-01',
      });

      const state = service.getLatestState('char-1');
      expect(state.states.physical.health).toBe(90);
      expect(state.states.physical.location).toBe('京城');
    });

    it('should return null for no state', () => {
      (stateRepo.getLatestState as any).mockReturnValue(undefined);
      const state = service.getLatestState('char-1');
      expect(state).toBeNull();
    });
  });
});
