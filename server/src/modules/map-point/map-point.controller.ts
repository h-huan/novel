/**
 * 地图地点 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MapPointService } from './map-point.service';
import { CreateMapPointDto, UpdateMapPointDto } from './dto/map-point.dto';

@ApiTags('map-point')
@Controller('projects/:projectId/map-points')
export class MapPointController {
  constructor(private readonly service: MapPointService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateMapPointDto) {
    return this.service.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Query('search') search?: string) {
    if (search) return this.service.search(projectId, search);
    return this.service.findByProjectId(projectId);
  }

  @Get('tree')
  getTree(@Param('projectId') projectId: string) {
    return this.service.getTree(projectId);
  }

  @Get('by-level/:level')
  findByLevel(@Param('projectId') projectId: string, @Param('level') level: string) {
    return this.service.findByLevel(projectId, level);
  }

  @Get('by-parent/:parentId')
  findByParentId(@Param('projectId') projectId: string, @Param('parentId') parentId: string) {
    return this.service.findByParentId(projectId, parentId);
  }

  @Get('by-character/:characterId')
  findByCharacter(@Param('projectId') projectId: string, @Param('characterId') characterId: string) {
    return this.service.findByCharacter(projectId, characterId);
  }

  @Get('by-chapter/:chapterId')
  findByChapter(@Param('projectId') projectId: string, @Param('chapterId') chapterId: string) {
    return this.service.findByChapter(projectId, chapterId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMapPointDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
