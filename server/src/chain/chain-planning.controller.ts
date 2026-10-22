import { Body, Controller, Get, HttpException, Logger, Param, Post, Sse } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { redactDiagnosticText, redactDiagnosticValue } from '../common/diagnostic-redaction';
import { ApiTags } from '@nestjs/swagger';
import { ChainController } from './chain.controller';
import { generationTasks } from '../common/generation-cancellation';
import { DatabaseService } from '../database/database.service';
import { readConstitution, settingsObject } from '../modules/project/creative-constitution';
import { isGateRejection } from '../modules/writing-quality/gate-failure';
import { ideaDiscoveryAuthorSettings } from './idea-discovery-contract';

/**
 * Planning/project lifecycle HTTP adapter.
 *
 * The large ChainController is intentionally kept as an internal orchestrator during the
 * incremental decomposition. New HTTP endpoints must be added to a focused adapter/service,
 * not registered on the orchestrator again.
 */
@ApiTags('chain')
@Controller('chain')
export class ChainPlanningController {
  private readonly logger = new Logger(ChainPlanningController.name);

  constructor(
    private readonly chain: ChainController,
    private readonly database?: DatabaseService,
  ) {}

  @Post('idea-discover')
  async ideaDiscover(@Body() dto: Parameters<ChainController['ideaDiscover']>[0]) {
    const requested = Number(dto.count);
    const desiredCount = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 10) : 5;
    const discoveryRequestId = randomUUID();
    const startedAt = new Date().toISOString();
    const requestSnapshot = redactDiagnosticValue({
      ...ideaDiscoveryAuthorSettings(dto),
      storyType: dto.storyType ?? null,
      platform: dto.platform ?? null,
      storyCategory: dto.storyCategory ?? null,
      targetAudience: dto.targetAudience ?? null,
      requestedCount: desiredCount,
    });
    let result: any = null;
    let thrownError: unknown = null;
    try {
      result = await this.chain.ideaDiscover({ ...dto, count: desiredCount });
    } catch (error) {
      thrownError = error;
    }
    const finishedAt = new Date().toISOString();

    if (this.database) {
      try {
        await this.database.dualWrite('latest_idea_discovery_audit', redactDiagnosticValue({
          schemaVersion: 1,
          discoveryRequestId,
          startedAt,
          finishedAt,
          generatedAt: finishedAt,
          request: requestSnapshot,
          success: !thrownError && result?.success === true,
          totalIdeas: thrownError ? 0 : Number(result?.totalIdeas ?? (Array.isArray(result?.ideas) ? result.ideas.length : 0)) || 0,
          qualityWarning: result?.qualityWarning ?? null,
          error: thrownError
            ? redactDiagnosticText(thrownError instanceof Error ? thrownError.message : String(thrownError))
            : result?.error == null ? null : redactDiagnosticText(result.error),
          appealGate: (thrownError as any)?.appealGate ?? result?.appealGate ?? null,
          acceptedIdeas: !thrownError && Array.isArray(result?.ideas)
            ? result.ideas.slice(0, desiredCount).map((idea: any) => ({
                sourcePremiseId: idea?.sourcePremiseId ?? null,
                title: idea?.title ?? null,
                hook: idea?.hook ?? null,
                coreConflict: idea?.coreConflict ?? idea?.conflict ?? null,
                uniquePoint: idea?.uniquePoint ?? idea?.uniqueSelling ?? idea?.storyCore ?? null,
                mainReversal: idea?.mainReversal ?? null,
                noveltyProof: idea?.noveltyProof ?? null,
                ideaAppealGate: idea?.ideaAppealGate ?? null,
              }))
            : [],
        }));
      } catch (error) {
        this.logger.warn('灵感发现诊断落库失败（不影响题材返回）：' + redactDiagnosticText(error instanceof Error ? error.message : String(error)));
      }
    }
    if (thrownError) throw thrownError;
    return result;
  }

  @Get('idea-discovery-diagnostics/latest')
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

  @Post('cancel-creation/:projectId')
  cancelCreation(@Param('projectId') projectId: string) {
    return generationTasks.cancel('creation', projectId);
  }

  @Post('create-project-async')
  createProjectAsync(@Body() dto: Parameters<ChainController['createProjectAsync']>[0]) {
    return this.chain.createProjectAsync(dto);
  }

  @Sse('project-creation-progress/:projectId')
  projectCreationProgress(@Param('projectId') projectId: string) {
    return this.chain.projectCreationProgress(projectId);
  }

  @Get('generation-recovery/:projectId')
  async getGenerationRecovery(@Param('projectId') projectId: string) {
    const recovery: any = await this.chain.getGenerationRecovery(projectId);
    if (!this.database) return recovery;

    const project = this.database.getDb().prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
    if (!project) return recovery;
    const confirmedStory: any = readConstitution(project).confirmedStory;
    // Full batch diagnostics remain available here, outside generation/review contexts.
    const storedSettings = settingsObject(project.settings);
    const storedAudit = storedSettings.ideaDiscoveryAudit
      ?? storedSettings.creativeConstitution?.confirmedStory?.ideaDiscoveryAudit;
    const storySelection = confirmedStory && typeof confirmedStory === 'object' && !Array.isArray(confirmedStory)
      ? {
          title: confirmedStory.title ?? null,
          hook: confirmedStory.hook ?? null,
          coreConflict: confirmedStory.coreConflict ?? confirmedStory.conflict ?? null,
          mainReversal: confirmedStory.mainReversal ?? null,
          uniquePoint: confirmedStory.uniquePoint ?? confirmedStory.uniqueSelling ?? confirmedStory.storyCore ?? null,
          estimatedWords: confirmedStory.recommendedTargetWords ?? confirmedStory.estimatedWords ?? null,
          readerExperienceProfile: confirmedStory.readerExperienceProfile ?? null,
          ideaDiscoveryAudit: storedAudit ?? null,
        }
      : null;

    return {
      ...recovery,
      diagnosticSchemaVersion: 2,
      storySelection,
      // latest.json 已完整保存本接口返回；这里明确告诉验收器/人工阅读者去哪找体验策略与本轮发现审计。
      readerExperienceProfilePresent: Boolean(storySelection?.readerExperienceProfile),
      ideaDiscoveryAuditPresent: Boolean(storySelection?.ideaDiscoveryAudit),
    };
  }

  @Post('generation-recovery/:projectId/resume-start')
  startFailedGenerationRecovery(@Param('projectId') projectId: string) {
    return this.chain.startFailedGenerationRecovery(projectId);
  }

  @Post('generation-recovery/:projectId/rebuild-from-confirmed-idea-start')
  startSourceHierarchyRebuild(@Param('projectId') projectId: string) {
    return this.chain.startSourceHierarchyRebuild(projectId);
  }

  @Post('generation-recovery/:projectId/resume')
  resumeFailedGeneration(@Param('projectId') projectId: string) {
    return this.chain.resumeFailedGeneration(projectId);
  }

  @Post('generate-outline')
  async generateOutline(@Body() dto: Parameters<ChainController['generateOutline']>[0]) {
    try {
      return await this.chain.generateOutline(dto);
    } catch (error) {
      if (isGateRejection(error)) {
        throw new HttpException({ message: error.report.message, error: 'QualityGateRejected', gateReport: error.report }, error.report.status);
      }
      throw error;
    }
  }

  @Post('expand-outline-chapter')
  expandOutlineChapter(@Body() dto: Parameters<ChainController['expandOutlineChapter']>[0]) {
    return this.chain.expandOutlineChapter(dto);
  }

  @Post('rollout-outline')
  rolloutOutline(@Body() dto: Parameters<ChainController['rolloutOutline']>[0]) {
    return this.chain.rolloutOutline(dto);
  }

  @Post('word-plan')
  wordPlan(@Body() dto: Parameters<ChainController['wordPlan']>[0]) {
    return this.chain.wordPlan(dto);
  }

  @Post('generate-title')
  generateTitle(@Body() dto: Parameters<ChainController['generateTitle']>[0]) {
    return this.chain.generateTitle(dto);
  }

  @Post('style-detect')
  styleDetect(@Body() dto: Parameters<ChainController['styleDetect']>[0]) {
    return this.chain.styleDetect(dto);
  }

  @Post('style-mix')
  styleMix(@Body() dto: Parameters<ChainController['styleMix']>[0]) {
    return this.chain.styleMix(dto);
  }
}
