import { test, expect } from '@playwright/test';
test('inspection API reports insufficient evidence instead of synthetic scores', async ({ request }) => {
  const res = await request.post(`http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1/refinement/quality/inspect`, {
    data: { content: '清晨，他走进房间。晚上，他走出房间。' },
  });
  expect(res.status()).toBe(201);
  const result = await res.json();
  expect(result.overallScore).toBeNull();
  expect(result.evaluation.status).toBe('not_evaluated');
  expect(result.characterDrift).toEqual([]);
  expect(result.foreshadowingMisses).toEqual([]);
  expect(result.logicIssues).toEqual([]);
});
