import { describe, expect, it } from 'vitest';
import { buildLongNovelGuard, buildShortStoryGuard } from './workflow-rules';

const assets = (overrides: Record<string, unknown> = {}) => ({
  project: { id: 'p', description: '', target_platform: 'generic' },
  hasIdea: false, hasConfirmedIdea: false, hasWorldSetting: false, hasMainCharacter: false,
  hasAntagonist: false, hasOutline: false, hasBookOutline: false, hasVolumeOutline: false,
  hasChapterPlan: false, hasBody: false, pendingStateCount: 0, confirmedStateCount: 0,
  hasShortCoreConflict: false, hasShortProtagonistDesire: false, hasShortTurningPoint: false,
  hasShortEndingClosure: false, hasShortSceneSequence: false,
  ...overrides,
}) as any;

describe('workflow hard rules', () => {
  it('blocks short-story body generation until an outline exists', () => {
    expect(buildShortStoryGuard(assets(), 'topic').blockedActions.map((x: any) => x.key)).toContain('generate_body');
    expect(buildShortStoryGuard(assets({ hasOutline: true }), 'writing').blockedActions.map((x: any) => x.key)).toContain('generate_body');
    expect(buildShortStoryGuard(assets({
      hasOutline: true,
      hasShortCoreConflict: true,
      hasShortProtagonistDesire: true,
      hasShortTurningPoint: true,
      hasShortEndingClosure: true,
      hasShortSceneSequence: true,
    }), 'writing').allowedActions.map((x: any) => x.key)).toContain('generate_body');
    expect(buildShortStoryGuard(assets({
      hasOutline: true,
      hasShortCoreConflict: true,
      hasShortProtagonistDesire: true,
      hasShortTurningPoint: true,
      hasShortEndingClosure: true,
      hasShortSceneSequence: true,
    }), 'outline').allowedActions.map((x: any) => x.key)).toContain('generate_body');
  });

  it('allows a long novel body only after a chapter plan exists', () => {
    expect(buildLongNovelGuard(assets({ hasWorldSetting: true, hasMainCharacter: true, hasBookOutline: true, hasVolumeOutline: true }), 'writing').blockedActions.map((x: any) => x.key)).toContain('generate_body');
    expect(buildLongNovelGuard(assets({ hasWorldSetting: true, hasMainCharacter: true, hasBookOutline: true, hasVolumeOutline: true, hasChapterPlan: true }), 'writing').allowedActions.map((x: any) => x.key)).toContain('generate_body');
    expect(buildLongNovelGuard(assets({ hasWorldSetting: true, hasMainCharacter: true, hasBookOutline: true, hasVolumeOutline: true, hasChapterPlan: true }), 'chapter').allowedActions.map((x: any) => x.key)).toContain('generate_body');
  });
});
