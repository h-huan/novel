import { describe, expect, it } from 'vitest';
import type { CreationStepStatus } from '../stores/discoveryStore';
import { updateCreationStepStatus } from './creation-progress';

const initial: CreationStepStatus = {
  project: 'done', skeleton: 'pending', world: 'pending', outline: 'pending', characters: 'pending',
  orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
};

describe('creation progress replay', () => {
  it('keeps the saved world complete when the following outline connection fails', () => {
    const world = updateCreationStepStatus(initial, { type: 'progress', step: 'world', status: 'done' });
    const outline = updateCreationStepStatus(world, { type: 'progress', step: 'outline', status: 'running' });
    const failed = updateCreationStepStatus(outline, { type: 'error', step: 'outline' });
    expect(failed.world).toBe('done');
    expect(failed.outline).toBe('failed');
    expect(failed.characters).toBe('pending');
    expect(updateCreationStepStatus(failed, { type: 'progress', step: 'world', status: 'running' }).world).toBe('done');
  });

  it('keeps long-form skeleton complete when world generation fails', () => {
    const skeleton = updateCreationStepStatus(initial, { type: 'progress', step: 'skeleton', status: 'done' });
    const world = updateCreationStepStatus(skeleton, { type: 'progress', step: 'world', status: 'running' });
    const failed = updateCreationStepStatus(world, { type: 'error', step: 'world' });
    expect(failed.skeleton).toBe('done');
    expect(failed.world).toBe('failed');
    expect(failed.outline).toBe('pending');
  });
});

describe('late creation stages',()=>{
 it('shows profile enrichment then review, and attributes the final error to review',()=>{
  const profiles=updateCreationStepStatus(initial,{type:'progress',step:'profiles',status:'done'});
  const review=updateCreationStepStatus(profiles,{type:'progress',step:'review',status:'running'});
  const failed=updateCreationStepStatus(review,{type:'error',step:'review'});
  expect(failed.profiles).toBe('done'); expect(failed.review).toBe('failed');expect(failed.timeline).toBe('pending');
 });
});
