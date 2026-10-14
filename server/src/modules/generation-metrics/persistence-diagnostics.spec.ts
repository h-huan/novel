import { describe, it, expect } from 'vitest';
import { classifyFrameworkPersistence } from './persistence-diagnostics';
describe('create framework persistence diagnostics', () => {
  it('does not report outline rollback at blocked Gate as lost committed data', () => {
    const result = classifyFrameworkPersistence({
      projectStatus:'generation_failed',creationStalled:false,
      observedMismatches:['outline_success_without_chapter_outline'],
      runs:[{stage:'outline',status:'failed',gate_status:'blocked'},{stage:'outline',status:'success'}],
    });
    expect(result.persistenceMismatch).toEqual([]);
    expect(result.uncommittedCandidates).toEqual(['outline_success_without_chapter_outline']);
    expect(result.blockedBeforeFrameworkCommit).toBe(true);
  });
  it('never hides missing persisted outlines after an accepted project', () => {
    const result = classifyFrameworkPersistence({projectStatus:'active',creationStalled:false,
      observedMismatches:['outline_success_without_chapter_outline'],
      runs:[{stage:'outline',status:'success'}],
    });
    expect(result.persistenceMismatch).toEqual(['outline_success_without_chapter_outline']);
    expect(result.uncommittedCandidates).toEqual([]);
  });
  it('preserves genuine missing world records despite an unrelated outline Gate rejection', () => {
    const result = classifyFrameworkPersistence({projectStatus:'generation_failed',creationStalled:false,
      observedMismatches:['world_success_without_world_setting','outline_success_without_chapter_outline'],
      runs:[{stage:'outline',status:'failed',gate_status:'blocked'}],
    });
    expect(result.persistenceMismatch).toEqual(['world_success_without_world_setting']);
    expect(result.uncommittedCandidates).toEqual(['outline_success_without_chapter_outline']);
  });
  it('does not suppress a later persistence failure merely because an old Gate run once blocked', () => {
    const result = classifyFrameworkPersistence({projectStatus:'generation_failed',creationStalled:false,
      observedMismatches:['outline_success_without_chapter_outline'],
      runs:[{stage:'outline',status:'failed',gate_status:'not_evaluated'},
        {stage:'outline',status:'failed',gate_status:'blocked'}],
    });
    expect(result.persistenceMismatch).toEqual(['outline_success_without_chapter_outline']);
    expect(result.uncommittedCandidates).toEqual([]);
  });
  it('keeps in-flight mismatches pending until active work truly stalls', () => {
    const x = {projectStatus:'creating',observedMismatches:['outline_success_without_chapter_outline'],
      runs:[{stage:'outline',status:'success'}]};
    expect(classifyFrameworkPersistence({...x,creationStalled:false}).pendingPersistenceMismatch).toHaveLength(1);
    expect(classifyFrameworkPersistence({...x,creationStalled:false}).persistenceMismatch).toEqual([]);
    expect(classifyFrameworkPersistence({...x,creationStalled:true}).persistenceMismatch).toHaveLength(1);
  });
});
