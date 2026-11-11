import { expect, it, vi } from 'vitest';
import { recordCreationStageFailure } from './creation-stage-failure';

it('records the real creation step as the stage instead of a synthetic refinement', () => {
  const beginRun = vi.fn(() => ({ id: 'run-1' }));
  const finishRun = vi.fn();
  recordCreationStageFailure(
    { beginRun, finishRun } as any,
    'project-1', 'outline', 'generation_execution', '章纲事实台账失败',
  );
  expect(beginRun).toHaveBeenCalledWith(
    'project-1', 'outline', '章纲事实台账失败', undefined, 'creation_stage_failure', undefined, false,
  );
  expect(finishRun).toHaveBeenCalledWith(
    'run-1', 'failed', expect.any(Number),
    expect.stringContaining('"step":"outline"'), '章纲事实台账失败',
  );
});
