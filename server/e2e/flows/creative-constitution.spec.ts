import { test, expect } from '@playwright/test';
test('constitution survives create/update/read and rejects conflicts over HTTP', async ({ request }) => {
  const url = `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/projects`;
  const created = await request.post(url, { data: { title: 'constitution-e2e', projectMode: 'short_story', platformStyle: 'zhihu', settings: { storyTone: ['克制'] } } });
  expect(created.status()).toBe(201);
  const p = await created.json();
  try {
    expect(p.creativeConstitution).toMatchObject({ revision: 1, projectType: 'short_story', targetPlatform: 'zhihu' });
    const cockpit = await request.get(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/generation-metrics/cockpit?projectId=${p.id}`);
    expect(cockpit.status()).toBe(200);
    expect((await cockpit.json()).scores.project.overallScore).toBeNull();
    const changed = await request.put(`${url}/${p.id}`, { data: { targetPlatform: 'fanqie' } });
    expect(changed.status()).toBe(200);
    const saved = await (await request.get(`${url}/${p.id}`)).json();
    expect(saved.creativeConstitution.revision).toBe(2);
    expect(saved.targetPlatform).toBe(saved.platformStyle);
    const conflict = await request.put(`${url}/${p.id}`, { data: { targetPlatform: 'zhihu', platformStyle: 'fanqie' } });
    expect(conflict.status()).toBe(400);
  } finally { await request.delete(`${url}/${p.id}`); }
});
