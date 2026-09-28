import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChainController } from './chain.controller';

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
  constructor(private readonly chain: ChainController) {}

  @Post('idea-discover')
  ideaDiscover(@Body() dto: Parameters<ChainController['ideaDiscover']>[0]) {
    return this.chain.ideaDiscover(dto);
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
