/**
 * 伏笔 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ForeshadowingService } from './foreshadowing.service';
import { CreateForeshadowingDto, UpdateForeshadowingDto, RecoverForeshadowingDto } from './dto/foreshadowing.dto';

@ApiTags('foreshadowing')
@Controller('projects/:projectId/foreshadowings')
export class ForeshadowingController {
  constructor(private readonly service: ForeshadowingService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateForeshadowingDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('status') status?: string) {
    return this.service.findByProjectId(projectId, status);
  }

  @Get('stats')
  getStats(@Param('projectId') projectId: string) {
    return this.service.getStats(projectId);
  }

  @Get('warnings')
  getOverdueWarnings(
    @Param('projectId') projectId: string,
    @Query('currentChapterIndex') currentChapterIndex: string,
  ) {
    return this.service.getOverdueWarnings(projectId, parseInt(currentChapterIndex, 10) || 1);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateForeshadowingDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post(':id/recover')
  recover(@Param('id') id: string, @Body() dto: RecoverForeshadowingDto) {
    return this.service.recover(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
