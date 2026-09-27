import { chapterExecutionContract, type ChapterPlan } from '../../../shared/src/types/content-contract';

const list = (value: unknown): string[] => Array.isArray(value)
  ? value.map(item => String(item ?? '').trim()).filter(Boolean)
  : [];

/**
 * Convert the existing persisted chapter outline into the canonical ChapterPlan.
 * Only facts already present in outline/detail are used; this adapter never
 * invents story facts and never creates a second chapter-contract record.
 */
export function chapterContractFromOutline(outline: any, detail: Record<string, any>) {
  if (!outline) return null;
  const scenes = Array.isArray(detail.scenes)
    ? detail.scenes
      .filter((scene: any) => scene && typeof scene === 'object')
      .map((scene: any) => ({
        title: typeof scene.title === 'string' ? scene.title : undefined,
        summary: String(scene.summary || scene.content || scene.goal || '').trim(),
        goal: typeof scene.goal === 'string' ? scene.goal : undefined,
        conflict: typeof scene.conflict === 'string' ? scene.conflict : undefined,
        outcome: typeof scene.outcome === 'string' ? scene.outcome : undefined,
        location: typeof scene.location === 'string' ? scene.location : undefined,
        characterIds: Array.isArray(scene.characterIds)
          ? scene.characterIds.filter((id: unknown) => typeof id === 'string')
          : undefined,
      }))
      .filter((scene: any) => scene.summary)
    : [];
  const characterActions = Array.isArray(detail.characterActions)
    ? detail.characterActions.filter((item: any) => item && typeof item.character === 'string' && typeof item.action === 'string')
    : [];
  const core = String(detail.core || detail.objective || detail.summary || outline.goal_arc || outline.content || '').trim();
  const conflict = String(detail.conflict || outline.conflict_design || '').trim();
  if (!core && !conflict && scenes.length === 0) return null;

  const plan: ChapterPlan = {
    core,
    scenes,
    characterActions,
    conflict,
    highlights: list(detail.highlights || detail.highlightPoints),
    foreshadowing: list(detail.foreshadowing),
    foreshadowingRecoveries: list(detail.foreshadowingRecoveries),
    characterStateChanges: list(detail.characterStateChanges),
    hook: String(detail.hook || detail.nextHook || outline.ending_setup || '').trim(),
    mood: String(detail.mood || detail.tone || '').trim(),
    reversalPoint: typeof detail.reversalPoint === 'string' ? detail.reversalPoint : undefined,
    hotScenes: list(detail.hotScenes),
    targetWords: Number.isFinite(Number(detail.targetWords || outline.target_words))
      ? Number(detail.targetWords || outline.target_words)
      : undefined,
    entryState: list(detail.entryState),
    objective: typeof detail.objective === 'string' ? detail.objective : undefined,
    mandatoryBeats: list(detail.mandatoryBeats),
    forbiddenFacts: list(detail.forbiddenFacts),
    characterKnowledge: list(detail.characterKnowledge),
    stateTransitions: list(detail.stateTransitions),
    foreshadowTasks: list(detail.foreshadowTasks),
    exitState: list(detail.exitState),
    nextHook: typeof detail.nextHook === 'string' ? detail.nextHook : undefined,
  };
  return chapterExecutionContract(plan);
}
