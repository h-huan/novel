from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_count = text.count(start)
    if start_count != 1:
        raise SystemExit(f'{label}: expected exactly 1 start anchor, got {start_count}')
    start_index = text.index(start)
    end_index = text.find(end, start_index + len(start))
    if end_index < 0:
        raise SystemExit(f'{label}: end anchor not found after start')
    return text[:start_index] + replacement + text[end_index:]


# ---- Move the one semantic/appeal gate into the discovery loop that owns recovery. ----
controller = Path('server/src/chain/chain.controller.ts')
text = controller.read_text(encoding='utf-8-sig')
text = replace_once(
    text,
    "import { ideaHookRequirement, ideaRecoveryDirective } from './idea-discovery-contract';\n",
    "import { ideaHookRequirement, ideaRecoveryDirective } from './idea-discovery-contract';\nimport { IdeaAppealGateService } from './idea-appeal-gate.service';\n",
    'appeal gate import',
)
text = replace_once(
    text,
    "    private readonly generatedCanonGuard: GeneratedCanonGuardService,\n    private readonly originalityGuard: OriginalityGuardService,\n  ) {}",
    "    private readonly generatedCanonGuard: GeneratedCanonGuardService,\n    private readonly originalityGuard: OriginalityGuardService,\n    // 唯一题材吸引力 Gate 在 runIdeaDiscovery 内执行；默认值仅兼容直接 new ChainController 的单测。\n    private readonly ideaAppealGate: IdeaAppealGateService = new IdeaAppealGateService(),\n  ) {}",
    'appeal gate constructor dependency',
)
text = replace_once(
    text,
    "      const accepted: any[] = [];\n      const rejectedReasons: string[] = [];",
    "      const accepted: any[] = [];\n      const rejectedReasons: string[] = [];\n      const candidateAssessments: any[] = [];",
    'assessment audit array',
)
text = replace_once(
    text,
    "      const accept = (candidates: any[]) => {\n        for (const candidate of candidates) {\n          if (accepted.length >= requestedCount) break;",
    "      const accept = (candidates: any[]) => {\n        for (const candidate of candidates) {",
    'assess all oversampled candidates',
)
old_gate_point = """          if (autoSelectionRequested && seenCombinations.has(combination)) issues.push('自动组合与本批已通过题材重复');
          if (issues.length) {
            rejectedReasons.push(...issues);
            continue;
          }
"""
new_gate_point = """          if (autoSelectionRequested && seenCombinations.has(combination)) issues.push('自动组合与本批已通过题材重复');

          // 唯一吸引力/留存 Gate 必须在这里执行：这里只有这一层同时掌握第一批失败原因和第二次补生。
          // 旧链路在 HTTP adapter 再筛一次，外层失败无法反馈给补生 Prompt，形成“内层通过、外层全灭”。
          const appealAssessment = this.ideaAppealGate.assess(candidate, dto.storyType);
          issues.push(...appealAssessment.issues);
          const uniqueIssues = Array.from(new Set(issues));
          const passed = uniqueIssues.length === 0;
          candidateAssessments.push({
            title: String(candidate?.title || ''),
            passed,
            issues: uniqueIssues,
            warnings: appealAssessment.warnings,
            signals: appealAssessment.signals,
            densityMode: appealAssessment.readerExperienceProfile.densityMode,
            pace: appealAssessment.readerExperienceProfile.pace,
            evidence: appealAssessment.readerExperienceProfile.evidence,
          });
          if (!passed) {
            rejectedReasons.push(...uniqueIssues);
            continue;
          }
"""
text = replace_once(text, old_gate_point, new_gate_point, 'single recoverable appeal gate')
text = replace_once(
    text,
    "            plannedChapters: Number(candidate.plannedChapters),\n          });",
    "            plannedChapters: Number(candidate.plannedChapters),\n            readerExperienceProfile: appealAssessment.readerExperienceProfile,\n            ideaAppealGate: {\n              passed: true,\n              distinctivenessScore: appealAssessment.signals.distinctivenessScore,\n              descriptionProgressions: appealAssessment.signals.descriptionProgressions,\n              hookHasRelationship: appealAssessment.signals.hookHasRelationship,\n            },\n          });",
    'attach single gate receipt',
)
text = replace_once(
    text,
    "      const firstBatch = await generateBatch(requestedCount, initialExcludes);",
    "      const firstBatchCount = Math.min(10, requestedCount + Math.min(3, requestedCount));\n      const firstBatch = await generateBatch(firstBatchCount, initialExcludes);",
    'move oversampling into recoverable gate',
)
old_tail_start = "      if (!accepted.length) {\n        const rejectionSummary"
tail_end = "    } catch (err) {"
new_tail = """      const selectedAccepted = accepted
        .sort((left, right) =>
          Number(right?.ideaAppealGate?.distinctivenessScore || 0) - Number(left?.ideaAppealGate?.distinctivenessScore || 0)
          || Number(right?.ideaAppealGate?.descriptionProgressions || 0) - Number(left?.ideaAppealGate?.descriptionProgressions || 0)
          || Number(Boolean(right?.ideaAppealGate?.hookHasRelationship)) - Number(Boolean(left?.ideaAppealGate?.hookHasRelationship)))
        .slice(0, requestedCount);
      const uniqueRejectedReasons = Array.from(new Set(rejectedReasons));
      const qualifiedCount = candidateAssessments.filter(item => item.passed === true).length;
      const appealGate = {
        schemaVersion: 3,
        mode: 'single_recoverable_reader_experience_gate',
        generated: candidateAssessments.length,
        qualified: qualifiedCount,
        returned: selectedAccepted.length,
        rejected: candidateAssessments.filter(item => item.passed !== true).length,
        reasons: uniqueRejectedReasons.slice(0, 8),
        candidateAssessments,
        acceptedEvidence: selectedAccepted.map(idea => ({
          title: String(idea?.title || ''),
          densityMode: idea?.readerExperienceProfile?.densityMode,
          pace: idea?.readerExperienceProfile?.pace,
          evidence: idea?.readerExperienceProfile?.evidence,
          distinctivenessScore: idea?.ideaAppealGate?.distinctivenessScore,
        })),
        note: '这是文本吸引力与读者体验前置 Gate，不是预测点击率/完读率；未通过候选只保留审计，不进入前端展示。',
      };

      if (!selectedAccepted.length) {
        const rejectionSummary = uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';
        this.logger.warn(`idea-discover: 两轮候选均未通过展示 Gate，内部淘汰原因：${rejectionSummary}`);
        return {
          success: false,
          ideas: [],
          totalIdeas: 0,
          error: '本轮候选均未达到展示标准，系统已按失败原因自动补生一次；未通过内容不会展示，请重新发现。',
          appealGate,
        };
      }
      const acceptedWithAudit = selectedAccepted.map(idea => ({ ...idea, ideaDiscoveryAudit: appealGate }));
      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材，逻辑调用不超过2次`);
      return {
        success: true,
        ideas: acceptedWithAudit,
        totalIdeas: acceptedWithAudit.length,
        appealGate,
        qualityWarning: acceptedWithAudit.length < requestedCount
          ? `本次有 ${acceptedWithAudit.length} 个题材通过展示 Gate；其余结果已淘汰，不用占位内容补数。`
          : undefined,
      };
"""
text = replace_between(text, old_tail_start, tail_end, new_tail, 'audit and return tail')
controller.write_text(text, encoding='utf-8')


# ---- HTTP adapter becomes thin; it validates provenance but never re-scores. ----
planning = Path('server/src/chain/chain-planning.controller.ts')
text = planning.read_text(encoding='utf-8')
text = replace_once(text, "import { IdeaAppealGateService } from './idea-appeal-gate.service';\n", '', 'remove adapter gate import')
text = replace_once(
    text,
    "  constructor(\n    private readonly chain: ChainController,\n    private readonly ideaAppealGate: IdeaAppealGateService,\n    private readonly database?: DatabaseService,\n  ) {}",
    "  constructor(\n    private readonly chain: ChainController,\n    private readonly database?: DatabaseService,\n  ) {}",
    'adapter constructor',
)
method_start = "  @Post('idea-discover')\n  async ideaDiscover"
method_end = "  @Post('create-project-async')"
new_method = """  @Post('idea-discover')
  async ideaDiscover(@Body() dto: Parameters<ChainController['ideaDiscover']>[0]) {
    const requested = Number(dto.count);
    const desiredCount = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 10) : 5;
    // 唯一 Gate 已在 ChainController.runIdeaDiscovery 内执行，并能把失败原因反馈给同一轮补生。
    // HTTP adapter 只验证“通过凭证”，绝不再执行第二套评分/淘汰逻辑。
    const result: any = await this.chain.ideaDiscover({ ...dto, count: desiredCount });
    if (!result?.success || !Array.isArray(result?.ideas)) return result;

    const accepted = result.ideas
      .filter((idea: any) => idea?.ideaAppealGate?.passed === true)
      .slice(0, desiredCount);
    if (!accepted.length) {
      return {
        ...result,
        success: false,
        ideas: [],
        totalIdeas: 0,
        error: '本轮没有通过展示标准的题材；未通过内容不会展示，请重新发现。',
      };
    }
    return {
      ...result,
      ideas: accepted,
      totalIdeas: accepted.length,
      qualityWarning: accepted.length < desiredCount
        ? `只返回 ${accepted.length}/${desiredCount} 个通过展示 Gate 的题材；弱候选已淘汰，不用占位内容补数。`
        : result.qualityWarning,
    };
  }

"""
text = replace_between(text, method_start, method_end, new_method, 'thin planning adapter')
planning.write_text(text, encoding='utf-8')
