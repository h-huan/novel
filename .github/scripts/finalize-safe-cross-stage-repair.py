from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, got {count} in {path}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {label}: {path}')


def replace_between(path: str, start: str, end: str, replacement: str, label: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8-sig')
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        raise RuntimeError(f'{label}: expected unique markers, got start={start_count}, end={end_count} in {path}')
    start_at = text.index(start)
    end_at = text.index(end, start_at)
    file.write_text(text[:start_at] + replacement + text[end_at:], encoding='utf-8')
    print(f'patched {label}: {path}')


chain = 'server/src/chain/chain.controller.ts'

# The first guarded script has already replaced the import with the immutable target map.
replace_once(
    chain,
    "import { CROSS_STAGE_PATCH_TABLE_MAP, applyCrossStagePatch, isImmutableWorldPatchTarget } from './cross-stage-patch';",
    "import { CROSS_STAGE_PATCH_TABLE_MAP, applyCrossStagePatch, isImmutableWorldPatchTarget, selectMinimumImpactCrossStagePatches } from './cross-stage-patch';",
    'import minimum-impact patch selector',
)

start = "        const validIds = new Set(Object.values(generatedBundle).flatMap((rows: any[]) => rows.map(row => String(row.id))));"
end = "        alignment = secondAlignmentResult.data;"
replacement = r'''        const validIds = new Set(Object.values(generatedBundle).flatMap((rows: any[]) => rows.map(row => String(row.id))));
        let appliedPatchCount = 0;
        let skippedPatchCount = 0;
        const previousBundleText = generatedBundleText;

        // 先让机器成本选择器从同一矛盾的候选位置里挑最小影响点；世界观在 selector 和目标映射两层都不可选。
        const repairCandidates = patches.map((patch: any) => {
          const match = String(patch?.match || '');
          const occurrences = match ? generatedBundleText.split(match).length - 1 : 0;
          return { ...patch, dependentCount: Math.max(0, occurrences - 1) };
        });
        const selectedPatches = selectMinimumImpactCrossStagePatches(repairCandidates);
        if (selectedPatches.length === 0) {
          throw new Error('跨模块一致性没有可安全自动修改的最小代价候选；世界观/锁定事实保持不变，项目未激活。');
        }

        // 所有修改先落在内存候选上。候选未通过二次审查前，数据库 Canon 一个字都不改。
        const candidateBundle = structuredClone(generatedBundle) as Record<string, any[]>;
        const candidateRows = Object.values(candidateBundle).flatMap((rows: any[]) => rows);
        const pendingUpdates = new Map<string, {
          table: string; field: string; entityId: string; entityType: string;
          originalValue: string; nextValue: string;
        }>();

        for (const patch of selectedPatches) {
          const entityType = String(patch?.entityType || '');
          const target = getPatchTarget(entityType);
          const entityId = String(patch?.entityId || '');
          const field = String(patch?.field || '');
          const replacement = patch?.replacement;
          const match = patch?.match;
          const visibleRow = candidateRows.find((row: any) => String(row.id) === entityId) as Record<string, unknown> | undefined;
          const immutableWorldTarget = isImmutableWorldPatchTarget(entityType);
          const skipReason = immutableWorldTarget
            ? `世界观 Canon 已冻结，跨阶段修复禁止修改 ${entityType}`
            : !target
              ? `未知实体类型 ${entityType}`
              : !target.fields.has(field)
                ? `字段 ${field} 受保护或不存在于表 ${target.table}`
                : !validIds.has(entityId)
                  ? `实体 ${entityId} 不在本次生成范围内`
                  : !visibleRow || typeof visibleRow[field] !== 'string' || !String(visibleRow[field]).includes(String(match))
                    ? '原文锚点不在本次审查资料中'
                    : typeof match !== 'string' || !match.trim() || typeof replacement !== 'string' || !replacement.trim()
                      ? '原文锚点或修订值为空'
                      : null;
          if (skipReason) {
            warnings.push(`一致性候选跳过：${entityType}#${entityId}.${field}（${skipReason}）`);
            skippedPatchCount++;
            continue;
          }
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
            skippedPatchCount++;
            continue;
          }

          const key = `${target!.table}:${entityId}:${field}`;
          let pending = pendingUpdates.get(key);
          if (!pending) {
            const currentRow = db.prepare(`SELECT "${field}" AS value FROM ${target!.table} WHERE id=? AND project_id=?`)
              .get(entityId, projectId) as { value: unknown } | undefined;
            if (!currentRow || typeof currentRow.value !== 'string') {
              warnings.push(`一致性候选目标字段不是文本，已跳过：${entityType}#${entityId}.${field}`);
              skippedPatchCount++;
              continue;
            }
            pending = {
              table: target!.table,
              field,
              entityId,
              entityType,
              originalValue: currentRow.value,
              nextValue: currentRow.value,
            };
            pendingUpdates.set(key, pending);
          }

          const nextStoredValue = applyCrossStagePatch(pending.nextValue, match, replacement);
          const nextVisibleValue = applyCrossStagePatch(String(visibleRow![field]), match, replacement);
          if (nextStoredValue === null || nextVisibleValue === null) {
            warnings.push(`一致性候选原文锚点缺失、不唯一或破坏JSON结构，已跳过：${entityType}#${entityId}.${field}`);
            skippedPatchCount++;
            continue;
          }
          pending.nextValue = nextStoredValue;
          visibleRow![field] = nextVisibleValue;
          appliedPatchCount++;
        }

        if (appliedPatchCount === 0 || pendingUpdates.size === 0) {
          throw new Error(`跨模块一致性没有形成可复查的候选修改（跳过${skippedPatchCount}处），项目未激活。`);
        }
        const candidateBundleText = JSON.stringify(candidateBundle);
        if (candidateBundleText === previousBundleText) {
          throw new Error(`跨模块一致性候选没有改变任何审查字段（候选${appliedPatchCount}处，跳过${skippedPatchCount}处），项目未激活。`);
        }

        const secondAlignmentResult = await this.llmCallWithRetry<any>(
          `跨模块故事一致性第${repairAttempt}次候选复查`,
          `${STORY_FACT_PRIORITY}\n核对候选修订后的资料是否严格属于同一个故事并且事实互不矛盾。世界观只是不可变参照，绝对不能通过修改世界观来让候选通过。检查确认题材与冻结世界观、角色、章纲、组织、地点、伏笔之间的专名、年龄、时间跨度、伤病历史、章节因果、结局和证据是否一致。只输出JSON:{"consistent":true,"canonicalFactsPreserved":["已保留事实"],"contradictions":["具体矛盾"],"unrelatedInventions":["无关虚构"]}\n【唯一故事基准】${canonicalCreativeBrief}\n【候选修订资料】${candidateBundleText}`,
          {
            temperature: 0.1,
            timeout: LLM_TUNABLES.timeoutComplex(),
            projectId,
            scenario: 'review',
            validate: (value: any) => describeAlignmentValidation(value).length === 0,
            describeValidation: describeAlignmentValidation,
          },
        );
        const candidateAlignment = secondAlignmentResult.data;
        if (!candidateAlignment) {
          throw new Error(`跨模块一致性候选复查未返回完整结构，数据库未修改：${secondAlignmentResult.warnings.join('；') || 'consistent/contradictions/unrelatedInventions缺失'}`);
        }
        const candidateContradictions = [
          ...(Array.isArray(candidateAlignment?.contradictions) ? candidateAlignment.contradictions : []),
          ...(Array.isArray(candidateAlignment?.unrelatedInventions) ? candidateAlignment.unrelatedInventions : []),
        ].map((item: any) => String(item || '').trim()).filter(Boolean);

        if (candidateAlignment.consistent === true && candidateContradictions.length === 0) {
          // 候选已审查通过后才允许写 live Canon；WHERE 旧值是乐观锁，防止复查期间其它流程改了同一字段。
          db.exec('BEGIN IMMEDIATE');
          try {
            for (const update of pendingUpdates.values()) {
              const updateResult = db.prepare(
                `UPDATE ${update.table} SET "${update.field}"=?, updated_at=? WHERE id=? AND project_id=? AND "${update.field}"=?`,
              ).run(update.nextValue, now(), update.entityId, projectId, update.originalValue);
              if (Number(updateResult.changes || 0) !== 1) {
                throw new Error(`一致性候选提交冲突：${update.entityType}#${update.entityId}.${update.field} 在复查期间已变化`);
              }
            }
            db.exec('COMMIT');
          } catch (error) {
            try { db.exec('ROLLBACK'); } catch {}
            throw error;
          }
          generatedBundle = readGeneratedBundle();
          generatedBundleText = JSON.stringify(generatedBundle);
          warnings.push(`跨模块一致性候选复查通过后提交 ${appliedPatchCount} 处最小影响修订（跳过 ${skippedPatchCount} 处），世界观未修改`);
        } else {
          // 失败候选只存在于内存，下一轮仍基于原 Canon 重新选最小代价点。
          warnings.push(`第${repairAttempt}次最小影响候选仍有${candidateContradictions.length}处冲突，已丢弃候选，数据库 Canon 未修改`);
        }

'''
replace_between(chain, start, end, replacement, 'review candidate before Canon commit')

replace_once(
    chain,
    "            suggestion: '修正世界观、角色、大纲、组织、地点或伏笔中的互斥事实后重新检查。',",
    "            suggestion: '保持冻结世界观不变，在章纲、未来计划、角色状态、组织、地点或伏笔中选择最小影响修复点后重新检查。',",
    'gate suggestion never tells caller to edit world',
)

print('safe cross-stage candidate-before-commit replacements applied')
