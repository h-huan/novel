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

@ApiTags('world-setting')
@Controller('projects/:projectId/world-settings')
export class WorldSettingController {
  constructor(
    private readonly service: WorldSettingService,
    private readonly conflictEngine: ConflictEngineService,
  ) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateWorldSettingDto) {
    return this.service.create(projectId, dto);
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorldSettingDto) {
    return this.service.update(id, dto);
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
}
