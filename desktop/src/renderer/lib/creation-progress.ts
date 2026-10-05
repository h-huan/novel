import type { CreationStepStatus } from '../stores/discoveryStore';

const stepKeys: Record<string, keyof CreationStepStatus> = {
  project: 'project', skeleton: 'skeleton', world: 'world', outline: 'outline',
  characters: 'characters', orgs: 'orgs', foreshadowing: 'foreshadowing',
  profiles: 'profiles', review: 'review', timeline: 'timeline', done: 'done',
};

export function updateCreationStepStatus(
  previous: CreationStepStatus,
  event: { type: string; step?: string; status?: string },
): CreationStepStatus {
  const next = { ...previous };
  if (event.type === 'progress') {
    const step = stepKeys[event.step || ''];
    if (!step) return next;
    const status = event.status === 'done' || event.status === 'failed' ? event.status : 'running';
    // SSE 重连会回放旧事件；不能让旧 running 覆盖已经完成的阶段。
    if (next[step] !== 'done' || status !== 'running') next[step] = status;
  } else if (event.type === 'error') {
    for (const step of Object.keys(next) as Array<keyof CreationStepStatus>) {
      if (next[step] === 'running') next[step] = 'failed';
    }
    const failedStep = stepKeys[event.step || ''];
    if (failedStep && next[failedStep] !== 'done') next[failedStep] = 'failed';
    next.done = 'failed';
  }
  return next;
}
