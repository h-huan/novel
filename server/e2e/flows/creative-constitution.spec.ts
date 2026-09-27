import { test, expect } from '@playwright/test';
import { uniqueTitle, validProjectPayload } from '../helpers';

test('constitution survives create/update/read and rejects conflicts over HTTP', async ({ request }) => {
  const url = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/projects`;
  const created = await request.post(url, {
    data: validProjectPayload({
      title: uniqueTitle('constitution-e2e'),
      type: 'short_story',
      targetWords: 12000,
    }),
  });
  expect(created.status(), await created.text()).toBe(201);
  const p = await created.json();
  try {
    expect(p.creativeConstitution).toMatchObject({ revision: 1, projectType: 'short_story', targetPlatform: 'custom' });
    const cockpit = await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/generation-metrics/cockpit?projectId=${p.id}`);
    expect(cockpit.status()).toBe(200);
    expect((await cockpit.json()).scores.project.overallScore).toBeNull();

    const changed = await request.put(`${url}/${p.id}`, { data: { storyTone: ['冷峻', '克制'] } });
    expect(changed.status(), await changed.text()).toBe(200);
    const saved = await (await request.get(`${url}/${p.id}`)).json();
    expect(saved.creativeConstitution.revision).toBe(2);
    expect(saved.storyTone).toEqual(saved.creativeConstitution.storyTone);
    expect(saved.targetPlatform).toBe(saved.creativeConstitution.targetPlatform);

    const conflict = await request.put(`${url}/${p.id}`, {
      data: { targetPlatform: 'custom', settings: { targetPlatform: 'fanqie' } },
    });
    expect(conflict.status()).toBe(400);
  } finally {
    await request.delete(`${url}/${p.id}`);
  }
});
