import { test, expect } from '@playwright/test';
test('benchmark runner returns waiting state and validates requests', async ({request}) => {
  const result=await request.post('/api/v1/generation-metrics/benchmark/run',{data:{projectId:'no-real-samples-e2e'}});
  expect(result.ok()).toBe(true);
  expect(JSON.stringify(await result.json())).toContain('waiting_for_real_samples');
  const invalid=await request.post('/api/v1/generation-metrics/benchmark/run',{data:{sampleIds:'bad'}});
  expect(invalid.status()).toBe(400);
  const runs=await request.get('/api/v1/generation-metrics/benchmark/runs?projectId=no-real-samples-e2e');
  expect(runs.ok()).toBe(true);
});
