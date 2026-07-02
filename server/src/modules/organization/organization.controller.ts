/**
 * 组织/势力 Controller
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@ApiTags('organization')
@Controller('projects/:projectId/organizations')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateOrganizationDto) {
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

  @Get('by-parent/:parentId')
  findByParentId(@Param('projectId') projectId: string, @Param('parentId') parentId: string) {
    return this.service.findByParentId(projectId, parentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
