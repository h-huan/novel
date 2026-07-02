/**
 * StoryDictController - 创作字典管理 API
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Logger } from '@nestjs/common';
import { StoryDictService } from './story-dict.service';

@Controller('dict')
export class StoryDictController {
  private readonly logger = new Logger(StoryDictController.name);

  constructor(private readonly service: StoryDictService) {}

  @Get(':type')
  getByType(@Param('type') type: string) {
    return { items: this.service.getByType(type) };
  }

  @Get('categories/all')
  getCategories() {
    return { categories: this.service.getCategories() };
  }

  @Get('types/all')
  getTypes() {
    return { types: this.service.getTypes() };
  }

  @Post()
  create(@Body() dto: { dictType: string; label: string; parentLabel?: string; sortOrder?: number }) {
    const item = this.service.create(dto);
    if (!item) return { success: false, error: '创建失败，请检查是否已存在相同标签' };
    return { success: true, item };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: { label?: string; parentLabel?: string; sortOrder?: number }) {
    const item = this.service.update(id, dto);
    if (!item) return { success: false, error: '未找到该字典项' };
    return { success: true, item };
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    const ok = this.service.delete(id);
    return { success: ok, error: ok ? undefined : '未找到该字典项' };
  }

  @Post('seed')
  seed() {
    const count = this.service.seedDefaults();
    return { success: true, count, message: `已填充 ${count} 条默认数据` };
  }
}
