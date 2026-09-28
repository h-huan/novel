/**
 * 项目 Controller
 */
import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProjectService } from './project.service';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/query-project.dto';

@ApiTags('project')
@Controller('projects')
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  @Get()
  findAll(@Query() query: ProjectQueryDto) {
    return this.service.findAll(query);
  }

  @Get('stats')
  getGlobalStats() {
    return this.service.getGlobalStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.service.getStats(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
