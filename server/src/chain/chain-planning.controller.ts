import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChainController } from './chain.controller';
import { IdeaAppealGateService } from './idea-appeal-gate.service';

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
  constructor(
    private readonly chain: ChainController,
    private readonly ideaAppealGate: IdeaAppealGateService,
  ) {}

  @Post('idea-discover')
  async ideaDiscover(@Body() dto: Parameters<ChainController['ideaDiscover']>[0]) {
    const requested = Number(dto.count);
    const desiredCount = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 10) : 5;
    // 同一次模型调用适度多取候选，再做确定性吸引力 Gate；不增加第三/第四次 LLM 调用。
    const sampleCount = Math.min(10, desiredCount + Math.min(3, desiredCount));
    const result: any = await this.chain.ideaDiscover({ ...dto, count: sampleCount });
    if (!result?.success || !Array.isArray(result?.ideas)) return result;

    const { accepted, assessed } = this.ideaAppealGate.select(
      result.ideas,
      desiredCount,
      dto.storyType === 'long_novel' ? 'long_novel' : 'short_story',
      String(dto.platform || ''),
    );
    const rejected = assessed.filter(item => !item.assessment.passed);
    const rejectionReasons = [...new Set(rejected.flatMap(item => item.assessment.issues))];
    const appealGate = {
      generated: result.ideas.length,
      passed: accepted.length,
      rejected: rejected.length,
      reasons: rejectionReasons.slice(0, 8),
      note: '这是文本吸引力硬 Gate，不是预测点击率/完读率；没有真实平台曝光与阅读数据时不输出虚假百分比。',
    };

    if (!accepted.length) {
      return {
        ...result,
        success: false,
        ideas: [],
        totalIdeas: 0,
        error: `灵感结果未通过点击/留存前置 Gate：${rejectionReasons.slice(0, 5).join('；') || '首屏吸引力不足'}`,
        appealGate,
      };
    }

    const qualityWarning = accepted.length < desiredCount
      ? `只返回 ${accepted.length}/${desiredCount} 个通过点击/留存前置 Gate 的题材；弱候选已淘汰，不用占位内容补数。`
      : result.qualityWarning;
    return {
      ...result,
      ideas: accepted,
      totalIdeas: accepted.length,
      qualityWarning,
      appealGate,
    };
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
  getGenerationRecovery(@Param('projectId') projectId: string) {
    return this.chain.getGenerationRecovery(projectId);
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
  generateOutline(@Body() dto: Parameters<ChainController['generateOutline']>[0]) {
    return this.chain.generateOutline(dto);
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
