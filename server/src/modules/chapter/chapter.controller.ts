/**
 * 章节 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChapterService } from './chapter.service';
import { GeneratedChapterCommitService } from './generated-chapter-commit.service';
import { AcceptGeneratedChapterDto, CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';

@ApiTags('chapter')
@Controller('projects/:projectId/chapters')
export class ChapterController {
  constructor(
    private readonly service: ChapterService,
    private readonly generatedCommit: GeneratedChapterCommitService,
  ) {}

  /** 作者手工创建章节。AI 主链不得使用此入口提交生成正文。 */
  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateChapterDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.service.findByProjectId(projectId);
  }

  @Get('volumes')
  getVolumes(@Param('projectId') projectId: string) {
    return this.service.getVolumes(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * 公共 PUT 默认只代表作者手工编辑。滚动升级期间旧前端仍会发送 source=ai_generated；
   * 该信号只能把请求转入严格验签服务，绝不能直接进入 ChapterService.update。
   */
  @Put(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    if (dto.source === 'ai_generated') {
      return this.generatedCommit.commit(projectId, id, dto.content || '');
    }
    const { source: _source, ...authorEdit } = dto;
    return this.service.update(id, authorEdit);
  }

  /** AI 正文唯一 Canon 提交入口。 */
  @Post(':id/accept-generated')
  acceptGenerated(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AcceptGeneratedChapterDto,
  ) {
    return this.generatedCommit.commit(projectId, id, dto.content);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/review')
  submitForReview(@Param('id') id: string) {
    return this.service.submitForReview(id);
  }

  @Post(':id/lock')
  lock(@Param('id') id: string) {
    return this.service.lock(id);
  }

  @Post(':id/direct-lock')
  directLock(@Param('id') id: string) {
    return this.service.directLock(id);
  }

  @Post(':id/unlock')
  unlock(@Param('id') id: string) {
    return this.service.unlock(id);
  }

  @Post(':id/reject-review')
  rejectReview(@Param('id') id: string) {
    return this.service.rejectReview(id);
  }

  @Get(':id/versions')
  getVersionHistory(@Param('id') id: string) {
    return this.service.getVersionHistory(id);
  }

  @Post(':id/versions/:version/restore')
  restoreVersion(@Param('id') id: string, @Param('version') version: number) {
    return this.service.restoreVersion(id, version);
  }

  @Post(':id/resync-derived-data')
  resyncDerivedData(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.resyncDerivedData(projectId, id);
  }

  @Post('resync-foreshadowings')
  resyncAllForeshadowings(@Param('projectId') projectId: string) {
    return this.service.resyncAllForeshadowings(projectId);
  }
}
