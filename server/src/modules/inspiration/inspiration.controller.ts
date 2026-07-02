/**
 * InspirationController - 灵感管理 API
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InspirationService } from './inspiration.service';
import { CreateInspirationDto, UpdateInspirationDto } from './dto/inspiration.dto';

@ApiTags('inspiration')
@Controller('inspirations')
export class InspirationController {
  constructor(private readonly service: InspirationService) {}

  @Get()
  @ApiOperation({ summary: '获取灵感列表' })
  findAll(@Query('status') status?: string, @Query('platform') platform?: string) {
    if (status) return this.service.findByStatus(status);
    if (platform) return this.service.findByPlatform(platform);
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取灵感详情' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '创建灵感' })
  create(@Body() dto: CreateInspirationDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新灵感' })
  update(@Param('id') id: string, @Body() dto: UpdateInspirationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除灵感' })
  remove(@Param('id') id: string) {
    this.service.remove(id);
    return { success: true };
  }

}
