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

@ApiTags('world-setting')
@Controller('projects/:projectId/world-settings')
export class WorldSettingController {
  constructor(
    private readonly service: WorldSettingService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly syncStates: CanonicalSyncStateService,
  ) {}

  @Post()
  async create(@Param('projectId') projectId: string, @Body() dto: CreateWorldSettingDto) {
    const result = this.service.create(projectId, dto);
    // getWritingSummary/indexing reads world_system_profiles as the canonical
    // writing source. Establish it in the same request before any reader runs;
    // otherwise a newly created world_setting is immediately unreadable.
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

  @Put(':id/profile')
  async updateProfile(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = this.service.updateProfile(projectId, id, body);
    const sync = await this.indexWorldSetting(projectId, result.worldSetting);
    return { ...result, sync };
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
    return { ...result, sync };
  }

  @Delete(':id')
  async remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    const result = this.service.remove(id);
    const sync = await this.syncStates.run(projectId, 'world_setting', id, () => this.vectorIndex.deleteChunksStrict(VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, [`world-setting:${id}`]));
    return { ...result, sync };
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
  async generateChangePlan(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: { changes: Record<string, string> }) {
    return this.service.generateChangePlan(projectId, id, dto.changes || {});
  }

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
    return { ...result, applied: true };
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
