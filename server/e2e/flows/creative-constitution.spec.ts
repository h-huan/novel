import { test, expect } from '@playwright/test';
import { createProject, uniqueTitle } from '../helpers';

test('constitution survives create/update/read and rejects conflicts over HTTP', async ({ request }) => {
  const url = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/projects`;
  const created = await createProject(request, uniqueTitle('constitution-e2e'));
  const p = created.response;
  try {
    expect(p.creativeConstitution).toMatchObject({ revision: 1, projectType: 'long_novel', targetPlatform: 'fanqie' });
    const cockpit = await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/generation-metrics/cockpit?projectId=${p.id}`);
    expect(cockpit.status()).toBe(200);
    expect((await cockpit.json()).scores.project.overallScore).toBeNull();

    const changed = await request.put(`${url}/${p.id}`, { data: { storyTone: ['冷峻', '克制'] } });
    expect(changed.status(), await changed.text()).toBe(200);
    const saved = await (await request.get(`${url}/${p.id}`)).json();
    expect(saved.creativeConstitution.revision).toBe(2);
    expect(saved.creativeConstitution.storyTone).toEqual(['冷峻', '克制']);
    expect(saved.creativeConstitution.targetPlatform).toBe('fanqie');

    const conflict = await request.put(`${url}/${p.id}`, {
      data: { targetPlatform: 'fanqie', settings: { targetPlatform: 'zhihu' } },
    });
    expect(conflict.status()).toBe(400);
  } finally {
    await request.delete(`${url}/${p.id}`);
  }
});
