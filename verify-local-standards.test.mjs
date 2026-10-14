import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExecutionStandards } from './verify-local-standards.mjs';
const source = 'system_workflow_rule_registry';
test('10 current registry rows at v203 are NOT reported as drift', () => {
  const rows = Array.from({length:10},(_,i)=>({moduleKey:'k'+i,version:203,seedBaselineVersion:203,source}));
  const x=analyzeExecutionStandards(rows,203,true);
  assert.equal(x.consistent,true);
  assert.deepEqual(x.mismatches,[]);
  assert.equal(x.activeCount,10);
});
test('actual version or provenance mismatch stays blocking', () => {
  const rows=[{moduleKey:'generation',version:202,seedBaselineVersion:202,source},
    {moduleKey:'workflow',version:203,seedBaselineVersion:203,source:'code_seed'}];
  const x=analyzeExecutionStandards(rows,203,true);
  assert.equal(x.consistent,false);
  assert.equal(x.mismatches.length,2);
});
test('missing endpoints, rows or registry version do not produce false passes', () => {
  assert.equal(analyzeExecutionStandards([],203,true).consistent,false);
  assert.equal(analyzeExecutionStandards([{version:203,seedBaselineVersion:203,source}],null,true).consistent,false);
  assert.equal(analyzeExecutionStandards([{version:203,seedBaselineVersion:203,source}],203,false).consistent,false);
});
