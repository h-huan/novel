/**
 * WorkflowGuardController - 流程守卫 API
 *
 * 路由前缀: /api/v1/projects/:projectId/workflow-guard
 */
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { WorkflowGuardService } from './workflow-guard.service';
import type { CheckActionRequest, AdvanceStageRequest } from './types';

@Controller('projects/:projectId/workflow-guard')
export class WorkflowGuardController {
  constructor(private readonly service: WorkflowGuardService) {}

  /**
   * 获取项目流程守卫状态
   * GET /api/v1/projects/:projectId/workflow-guard
   */
  @Get()
  getGuard(@Param('projectId') projectId: string) {
    return this.service.getGuard(projectId);
  }

  /**
   * 检查操作是否允许
   * POST /api/v1/projects/:projectId/workflow-guard/check
   */
  @Post('check')
  checkAction(
    @Param('projectId') projectId: string,
    @Body() body: CheckActionRequest,
  ) {
    return this.service.checkAction(projectId, body.action);
  }

  /**
   * 推进流程阶段
   * POST /api/v1/projects/:projectId/workflow-guard/advance
   */
  @Post('advance')
  advanceStage(
    @Param('projectId') projectId: string,
    @Body() body: AdvanceStageRequest,
  ) {
    return this.service.advanceStage(projectId, body.targetStage, body.force);
  }

  /**
   * Rebuild the persisted stage from real project assets.
   * POST /api/v1/projects/:projectId/workflow-guard/reset
   */
  @Post('reset')
  resetStage(@Param('projectId') projectId: string) {
    return this.service.resetStage(projectId);
  }
}
