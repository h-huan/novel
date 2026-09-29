from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


# 1) Keep enough rejected-candidate evidence in the single Gate audit for false-positive/false-negative review.
controller = Path('server/src/chain/chain.controller.ts')
text = controller.read_text(encoding='utf-8-sig')
old_assessment = """          candidateAssessments.push({
            title: String(candidate?.title || ''),
            passed,
            issues: uniqueIssues,
            warnings: appealAssessment.warnings,
            signals: appealAssessment.signals,
            densityMode: appealAssessment.readerExperienceProfile.densityMode,
            pace: appealAssessment.readerExperienceProfile.pace,
            evidence: appealAssessment.readerExperienceProfile.evidence,
          });"""
new_assessment = """          candidateAssessments.push({
            title: String(candidate?.title || ''),
            // 未通过候选不会进入前端，但必须保留足够文本证据供 latest.json 复盘 Gate 是否误杀。
            candidate: {
              title: String(candidate?.title || ''),
              hook: String(candidate?.hook || ''),
              description: String(candidate?.description || ''),
              protagonist: String(candidate?.protagonist || ''),
              coreConflict: String(candidate?.coreConflict || candidate?.conflict || ''),
              uniquePoint: String(candidate?.uniquePoint || candidate?.uniqueSelling || candidate?.storyCore || ''),
              mainReversal: String(candidate?.mainReversal || ''),
              noveltyProof: candidate?.noveltyProof ?? null,
              storyCategory: candidate?.storyCategory ?? dto.storyCategory,
              storyTone: candidate?.storyTone ?? dto.storyTone,
              writingStyle: candidate?.writingStyle ?? dto.writingStyle,
              webNovelGenre: candidate?.webNovelGenre ?? dto.webNovelGenre,
              pov: candidate?.pov ?? dto.pov,
              submissionTags: candidate?.submissionTags ?? dto.submissionTags,
              plotTags: candidate?.plotTags ?? dto.plotTags,
            },
            passed,
            issues: uniqueIssues,
            warnings: appealAssessment.warnings,
            signals: appealAssessment.signals,
            densityMode: appealAssessment.readerExperienceProfile.densityMode,
            pace: appealAssessment.readerExperienceProfile.pace,
            evidence: appealAssessment.readerExperienceProfile.evidence,
          });"""
text = replace_once(text, old_assessment, new_assessment, 'candidate audit evidence')
controller.write_text(text, encoding='utf-8')


# 2) Planning adapter persists the final discovery result, but never scores it.
planning = Path('server/src/chain/chain-planning.controller.ts')
text = planning.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';",
    "import { Body, Controller, Get, Logger, Param, Post, Sse } from '@nestjs/common';",
    'planning logger import',
)
text = replace_once(
    text,
    "export class ChainPlanningController {\n  constructor(",
    "export class ChainPlanningController {\n  private readonly logger = new Logger(ChainPlanningController.name);\n\n  constructor(",
    'planning logger field',
)
old_result = """    const result: any = await this.chain.ideaDiscover({ ...dto, count: desiredCount });
    if (!result?.success || !Array.isArray(result?.ideas)) return result;
"""
new_result = """    const result: any = await this.chain.ideaDiscover({ ...dto, count: desiredCount });
    if (this.database) {
      try {
        await this.database.dualWrite('latest_idea_discovery_audit', {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          request: {
            storyType: dto.storyType ?? null,
            platform: dto.platform ?? null,
            storyCategory: dto.storyCategory ?? null,
            targetAudience: dto.targetAudience ?? null,
            requestedCount: desiredCount,
          },
          success: result?.success === true,
          totalIdeas: Number(result?.totalIdeas ?? (Array.isArray(result?.ideas) ? result.ideas.length : 0)) || 0,
          qualityWarning: result?.qualityWarning ?? null,
          error: result?.error ?? null,
          appealGate: result?.appealGate ?? null,
          acceptedIdeas: Array.isArray(result?.ideas)
            ? result.ideas.slice(0, desiredCount).map((idea: any) => ({
                title: idea?.title ?? null,
                hook: idea?.hook ?? null,
                coreConflict: idea?.coreConflict ?? idea?.conflict ?? null,
                uniquePoint: idea?.uniquePoint ?? idea?.uniqueSelling ?? idea?.storyCore ?? null,
                mainReversal: idea?.mainReversal ?? null,
                noveltyProof: idea?.noveltyProof ?? null,
                ideaAppealGate: idea?.ideaAppealGate ?? null,
              }))
            : [],
        });
      } catch (error) {
        this.logger.warn(`灵感发现诊断落库失败（不影响题材返回）：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!result?.success || !Array.isArray(result?.ideas)) return result;
"""
text = replace_once(text, old_result, new_result, 'persist latest idea discovery')
route_anchor = """  @Post('create-project-async')
  createProjectAsync"""
route_block = """  @Get('idea-discovery-diagnostics/latest')
  getLatestIdeaDiscoveryDiagnostics() {
    if (!this.database) return { available: false, reason: 'database_unavailable' };
    try {
      const db = this.database.getDb();
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dual_write_store'").get() as any;
      if (!table) return { available: false, reason: 'no_discovery_audit_yet' };
      const row = db.prepare(`SELECT data_value, updated_at FROM dual_write_store WHERE data_key=? ORDER BY updated_at DESC LIMIT 1`)
        .get('latest_idea_discovery_audit') as any;
      if (!row?.data_value) return { available: false, reason: 'no_discovery_audit_yet' };
      try {
        return { available: true, updatedAt: row.updated_at ?? null, audit: JSON.parse(String(row.data_value)) };
      } catch {
        return { available: false, reason: 'invalid_discovery_audit_json', updatedAt: row.updated_at ?? null };
      }
    } catch (error) {
      return { available: false, reason: 'discovery_audit_read_failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  @Post('create-project-async')
  createProjectAsync"""
text = replace_once(text, route_anchor, route_block, 'idea diagnostics endpoint')
planning.write_text(text, encoding='utf-8')


# 3) latest.json always includes the latest idea-discovery batch, even when no project was created.
verify = Path('verify-local.mjs')
text = verify.read_text(encoding='utf-8')
old_health = """const health = await request('/health');
const standardsResponse = await request('/module-standards');"""
new_health = """const health = await request('/health');
const ideaDiscoveryResponse = await request('/chain/idea-discovery-diagnostics/latest');
const standardsResponse = await request('/module-standards');"""
text = replace_once(text, old_health, new_health, 'verify idea discovery request')
old_runtime = """const runtime = {
  health,
  standards: {"""
new_runtime = """const runtime = {
  health,
  ideaDiscovery: ideaDiscoveryResponse.ok
    ? unwrap(ideaDiscoveryResponse.data)
    : { available: false, error: ideaDiscoveryResponse.error ?? `HTTP ${ideaDiscoveryResponse.status}` },
  standards: {"""
text = replace_once(text, old_runtime, new_runtime, 'verify idea discovery runtime')
old_problem = """if (!runFull && !singleMode && projectTargets.length === 0) runtimeProblems.push('no_projects_found');"""
new_problem = """if (!runFull && !singleMode && projectTargets.length === 0) runtimeProblems.push('no_projects_found');
if (!runFull && runtime.ideaDiscovery?.available === true && runtime.ideaDiscovery?.audit?.success === false) {
  runtimeProblems.push('latest_idea_discovery_failed');
}"""
text = replace_once(text, old_problem, new_problem, 'verify idea discovery verdict')
verify.write_text(text, encoding='utf-8')
