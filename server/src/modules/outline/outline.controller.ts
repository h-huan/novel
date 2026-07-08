/**
 * 大纲 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OutlineService } from './outline.service';
import {
  ContinueOutlineDto,
  CreateOutlineDto,
  InsertOutlineDto,
  MoveOutlineDto,
  MoveOutlineOrderDto,
  RecommendOutlinePlanDto,
  ReorderChildrenDto,
  SplitOutlineDto,
  UpdateOutlineDto,
} from './dto/outline.dto';

@ApiTags('outline')
@Controller('projects/:projectId/outlines')
export class OutlineController {
  constructor(private readonly service: OutlineService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateOutlineDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.service.findByProjectId(projectId);
  }

  @Get('tree')
  getTree(@Param('projectId') projectId: string) {
    return this.service.getTree(projectId);
  }

  @Post('planning/recommend')
  recommendPlan(@Param('projectId') projectId: string, @Body() dto: RecommendOutlinePlanDto) {
    return this.service.recommendPlan(projectId, dto);
  }

  @Post('continue')
  continueCreate(@Param('projectId') projectId: string, @Body() dto: ContinueOutlineDto) {
    return this.service.continueCreate(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/children')
  findChildren(@Param('id') id: string) {
    return this.service.findChildren(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOutlineDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Param('projectId') projectId: string) {
    // 检查章节是否锁定
    const existing = (this.service as any).repo?.findById(id);
    if (existing?.status === 'locked') {
      throw new BadRequestException('已锁定章节不可删除');
    }
    return this.service.remove(id);
  }

  @Post(':id/split')
  split(@Param('id') id: string, @Body() dto: SplitOutlineDto) {
    return this.service.split(id, dto);
  }

  @Post(':id/insert')
  insertAdjacent(@Param('id') id: string, @Body() dto: InsertOutlineDto) {
    return this.service.insertAdjacent(id, dto);
  }

  @Post(':id/merge-next')
  mergeNext(@Param('id') id: string) {
    return this.service.mergeNext(id);
  }

  @Post(':id/move-order')
  moveOrder(@Param('id') id: string, @Body() dto: MoveOutlineOrderDto) {
    return this.service.moveOrder(id, dto.direction);
  }

  @Post(':id/move-to-volume')
  moveToVolume(@Param('id') id: string, @Body() dto: { targetVolumeId: string }) {
    return this.service.moveToVolume(id, dto.targetVolumeId);
  }

  @Post(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveOutlineDto) {
    return this.service.move(id, dto);
  }

  @Post(':id/reorder')
  reorderChildren(@Param('id') id: string, @Body() dto: ReorderChildrenDto) {
    return this.service.reorderChildren(id, dto);
  }
}
