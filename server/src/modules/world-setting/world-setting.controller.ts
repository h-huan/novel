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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorldSettingService } from './world-setting.service';
import { CreateWorldSettingDto, UpdateWorldSettingDto, AddConstraintDto } from './dto/world-setting.dto';
import { VectorIndexService } from '../../rag/vector-index.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { CanonicalSyncStateService } from '../../rag/canonical-sync-state.service';
import { ConsistencyCheckService } from '../../state/consistency-check.service';

@ApiTags('world-setting')
@Controller('projects/:projectId/world-settings')
export class WorldSettingController {
  constructor(
    private readonly service: WorldSettingService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly syncStates: CanonicalSyncStateService,
    private readonly consistencyCheck: ConsistencyCheckService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateWorldSettingDto) {
    const result = this.service.create(projectId, dto);
    // 创建阶段由生成链负责上层→下层审查；这里只建立唯一世界观档案。
    this.service.updateProfile(projectId, result.id, {
      synopsis: dto.workIntro || '',
      basic_info: [dto.name, dto.era].filter(Boolean).join('；'),
      era: dto.era || '',
      rules: (dto.constraints || []).map(item => item.rule).filter(Boolean).join('\n'),
      system_mechanics: dto.systemSettings || '',
      culture_customs: dto.culturalSettings || '',
      naming_rules: dto.namingRules || '',
      scale_plan: dto.dataPlanning || '',
      supplementary: dto.censorshipRules || '',
    });
    const sync = await this.indexWorldSetting(projectId, result);
    return { ...result, sync };
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.service.findByProjectId(projectId);
  }

  @Get(':id/profile')
  getProfile(@Param('projectId') projectId: string, @Param('id') id: string) { return this.service.getProfile(projectId, id); }

  /**
   * 项目创建后的世界观修改属于作者手动 Canon 修改。保存后必须立即复检，
   * 不能让世界规则改变后继续携带旧人物/时间线/正文事实运行。
   */
  @Put(':id/profile')
  async updateProfile(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = this.service.updateProfile(projectId, id, body);
    const sync = await this.indexWorldSetting(projectId, result.worldSetting);
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, sync, consistency };
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
    const sync = await this.indexWorldSetting(projectId, result);
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, sync, consistency };
  }

  @Delete(':id')
  async remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'world_setting', id, () => this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [`world-setting:${id}`]));
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, sync, consistency };
  }

  @Post(':id/constraints')
  async addConstraint(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: AddConstraintDto) {
    const result = this.service.addConstraint(id, dto);
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, consistency };
  }

  @Delete(':id/constraints/:constraintId')
  async removeConstraint(@Param('projectId') projectId: string, @Param('id') id: string, @Param('constraintId') constraintId: string) {
    const result = this.service.removeConstraint(id, constraintId);
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, consistency };
  }

  @Post(':id/change-plan')
  async generateChangePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: { changes: Record<string, string> }) {
    return this.service.generateChangePlan(projectId, id, dto.changes || {});
  }

  /** 只有用户明确 confirmed=true 才允许应用世界观修改计划。 */
  @Post(':id/apply-change-plan')
  async applyChangePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: { changes?: Record<string, string>; confirmed?: boolean }) {
    if (!dto.confirmed) {
      return { applied: false, message: '用户驳回修改申请' };
    }
    const changes = dto.changes || {};
    if (!Object.keys(changes).length) {
      return { applied: false, message: '无修改内容' };
    }
    const result = await this.service.update(id, changes as any);
    const sync = await this.indexWorldSetting(projectId, result);
    const consistency = await this.revalidateManualWorldChange(projectId);
    return { ...result, applied: true, sync, consistency };
  }

  private async revalidateManualWorldChange(projectId: string) {
    // 世界观变化只重跑受其影响的结构维度，避免顺带触发无关的写作质量评审。
    const checks = await this.consistencyCheck.checkConsistency(projectId, {
      checkTypes: ['world_setting', 'timeline', 'plot_logic'],
    });
    const blocking = checks.filter(item => item.status === 'error' || item.severity === 'high');
    const warnings = checks.filter(item => item.status === 'warning');
    return {
      checked: checks.length,
      consistent: blocking.length === 0 && warnings.length === 0,
      blocking: blocking.length,
      warnings: warnings.length,
      message: checks.length === 0 ? '世界观保存后复检通过' : '世界观已保存，但下游存在需要处理的一致性问题',
    };
  }

  /** Keep the full persisted profile available to retrieval, not just basic fields. */
  private async indexWorldSetting(projectId: string, worldSetting: any) {
    return this.syncStates.run(projectId, 'world_setting', worldSetting.id, async () => {
      const summary = this.service.getWritingSummary(projectId, worldSetting.id).summary;
      const text = `${worldSetting.name || ''}\n${summary}`;
      const [vector] = await this.embedding.embed([text]);
      await this.vectorIndex.indexChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [{
        chunk: {
          id: `world-setting:${worldSetting.id}`,
          text,
          docType: 'world_setting',
          metadata: {
            chunkIndex: 0,
          },
        },
        vector,
      }]);
    });
  }
}