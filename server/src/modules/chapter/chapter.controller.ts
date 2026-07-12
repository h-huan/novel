/**
 * 章节 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChapterService } from './chapter.service';
import { CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';

@ApiTags('chapter')
@Controller('projects/:projectId/chapters')
export class ChapterController {
  constructor(private readonly service: ChapterService) {}

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

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.service.update(id, dto);
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

  @Post(':id/unlock')
  unlock(@Param('id') id: string) {
    return this.service.unlock(id);
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
}
