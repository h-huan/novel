from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


path = Path('server/src/chain/chain.controller.ts')
text = path.read_text(encoding='utf-8')

old_start = """      let repairAttempt = 0;
      const MAX_CONSISTENCY_REPAIRS = 2;
      while (!alignment || alignment.consistent !== true || contradictions.length > 0) {
"""
new_start = """      let repairAttempt = 0;
      const MAX_CONSISTENCY_REPAIRS = 2;
      const consistencyOriginalValues = new Map<string, { table: string; entityId: string; field: string; value: string; updatedAt: string | null }>();
      const restoreConsistencyPatches = () => {
        if (consistencyOriginalValues.size === 0) return;
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const original of consistencyOriginalValues.values()) {
            db.prepare(`UPDATE ${original.table} SET \"${original.field}\"=?, updated_at=? WHERE id=? AND project_id=?`)
              .run(original.value, original.updatedAt, original.entityId, projectId);
          }
          db.exec('COMMIT');
        } catch (restoreError) {
          try { db.exec('ROLLBACK'); } catch {}
          throw new Error(`跨模块一致性失败后的 Canon 恢复失败：${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
        }
        generatedBundle = readGeneratedBundle();
        generatedBundleText = JSON.stringify(generatedBundle);
      };
      try {
      while (!alignment || alignment.consistent !== true || contradictions.length > 0) {
"""
text = once(text, old_start, new_start, 'repair-loop rollback ledger')

text = once(
    text,
    """        const patches = repairResult.data?.patches;
""",
    """        this.generatedCanonGuard.assertStructuredCanCommit({
          projectId,
          runId: repairResult.runId,
          expectedStages: ['refinement'],
          expectedScenarios: ['review'],
        });
        const patches = repairResult.data?.patches;
""",
    'repair run provenance guard',
)

text = once(
    text,
    """            const currentRow = db.prepare(`SELECT \"${field}\" AS value FROM ${target!.table} WHERE id=? AND project_id=?`)
              .get(entityId, projectId) as { value: unknown } | undefined;
""",
    """            const currentRow = db.prepare(`SELECT \"${field}\" AS value, updated_at FROM ${target!.table} WHERE id=? AND project_id=?`)
              .get(entityId, projectId) as { value: unknown; updated_at?: string | null } | undefined;
""",
    'read original timestamp',
)

text = once(
    text,
    """            const storedValue = applyCrossStagePatch(currentRow.value, match, replacement);
""",
    """            const originalKey = `${target!.table}\u0000${entityId}\u0000${field}`;
            if (!consistencyOriginalValues.has(originalKey)) {
              consistencyOriginalValues.set(originalKey, {
                table: target!.table,
                entityId,
                field,
                value: currentRow.value,
                updatedAt: currentRow.updated_at ?? null,
              });
            }
            const storedValue = applyCrossStagePatch(currentRow.value, match, replacement);
""",
    'capture original Canon value',
)

# Close the try around the whole iterative repair loop immediately before the
# post-loop final gate. Search only after the loop start so we do not touch other
# similarly worded conditions elsewhere in the controller.
start_index = text.index("      try {\n      while (!alignment || alignment.consistent !== true || contradictions.length > 0) {")
final_gate = "      if (!alignment || alignment.consistent !== true || contradictions.length > 0) {"
final_index = text.find(final_gate, start_index + 20)
if final_index < 0:
    raise SystemExit('post-loop final gate not found')
text = text[:final_index] + """      } catch (error) {
        restoreConsistencyPatches();
        throw error;
      }
""" + text[final_index:]

# A normal exhausted repair loop does not throw until this final gate; restore
# before recording/throwing the failure so failed projects never keep repair
# mutations in Canon.
text = once(
    text,
    final_gate + "\n",
    final_gate + "\n        restoreConsistencyPatches();\n",
    'restore on final failed gate',
)

# The old wording claimed the second review had already happened before the call.
text = once(
    text,
    """        warnings.push(`跨模块一致性自动修订 ${appliedPatchCount} 处（跳过 ${skippedPatchCount} 处无效字段），并已执行二次审查`);
""",
    """        warnings.push(`跨模块一致性自动修订 ${appliedPatchCount} 处（跳过 ${skippedPatchCount} 处无效字段），开始二次审查`);
""",
    'accurate repair progress wording',
)

path.write_text(text, encoding='utf-8')
