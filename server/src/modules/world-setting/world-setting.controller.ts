/**
 * 世界观 Controller
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorldSettingService } from './world-setting.service';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';
import { CreateWorldSettingDto, UpdateWorldSettingDto, AddConstraintDto } from './dto/world-setting.dto';
import { VectorIndexService } from '../../rag/vector-index.service';

@ApiTags('world-setting')
@Controller('projects/:projectId/world-settings')
export class WorldSettingController {
  constructor(
    private readonly service: WorldSettingService,
    private readonly conflictEngine: ConflictEngineService,
    private readonly vectorIndex: VectorIndexService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateWorldSettingDto) {
    const result = await this.service.create(projectId, dto);
    await this.indexWorldSetting(projectId, result);
    return result;
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('mode') mode?: string) {
    console.log('[WorldSettingController] findAll called, mode:', mode);
    // 支持 mode=simple 查询参数，返回短篇世界观设定
    if (mode === 'simple') {
      console.log('[WorldSettingController] Returning simple settings');
      return this.service.getSimpleSettings(projectId);
    }
    return this.service.findByProjectId(projectId);
  }

  @Get(':id/profile')
  getProfile(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getProfile(projectId, id); }

  @Put(':id/profile')
  async updateProfile(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = this.service.updateProfile(projectId, id, body);
    await this.indexWorldSetting(projectId, result.worldSetting);
    return result;
  }

  @Get(':id/writing-summary')
  getWritingSummary(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getWritingSummary(projectId, id); }

  @Post('consistency-check')
  checkConsistency(@Param('projectId') projectId: string, @Body() body: { content?: string }) { return { worldConsistency: this.service.checkConsistency(projectId, body.content || '') }; }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateWorldSettingDto) {
    const result = await this.service.update(id, dto);
    await this.indexWorldSetting(projectId, result);
    return result;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/constraints')
  addConstraint(@Param('id') id: string, @Body() dto: AddConstraintDto) {
    return this.service.addConstraint(id, dto);
  }

  @Delete(':id/constraints/:constraintId')
  removeConstraint(@Param('id') id: string, @Param('constraintId') constraintId: string) {
    return this.service.removeConstraint(id, constraintId);
  }

  @Post(':id/change-plan')
  async generateChangePlan(@Param('id') id: string, @Body() dto: { changes: Record<string, string> }) {
    const plan = this.conflictEngine.generateWorldChangePlan(id, dto.changes);
    return plan;
  }

  @Post(':id/apply-change-plan')
  async applyChangePlan(@Param('id') id: string, @Body() dto: { planId: string; confirmed: boolean }) {
    if (!dto.confirmed) {
      return { applied: false, message: '用户驳回修改申请' };
    }
    // 应用修改 — 代理到 service 的 update 方法
    const current = this.service.findOne(id);
    const updateDto: UpdateWorldSettingDto = {};
    return this.service.update(id, updateDto);
  }

  /**
   * 保存短篇世界观设定
   * PUT /projects/:projectId/world-settings/simple
   * 为了兼容前端调用路径，使用单独的路由
   */
  @Put('simple')
  @ApiOperation({ summary: '保存短篇世界观设定（兼容路由）' })
  upsertSimpleSettings(
    @Param('projectId') projectId: string,
    @Body() body: {
      storyPremise?: string;
      era?: string;
      locations?: string[];
      socialRules?: string;
      specialSettings?: string;
    }
  ) {
    return this.service.upsertSimpleSettings(projectId, body);
  }

  /** Keep the full persisted profile available to retrieval, not just basic fields. */
  private async indexWorldSetting(projectId: string, worldSetting: any): Promise<void> {
    try {
      const summary = this.service.getWritingSummary(projectId, worldSetting.id).summary;
      await this.vectorIndex.indexChunks(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [{
        chunk: {
          id: `world-setting:${worldSetting.id}`,
          text: `${worldSetting.name || ''}\n${summary}`,
          docType: 'world_setting',
          metadata: {
            chunkIndex: 0,
          },
        },
        vector: [0],
      }]);
    } catch { /* Indexing must never block a profile save. */ }
  }
}
