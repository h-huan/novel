/**
 * 素材库控制器
 *
 * 提供素材库相关 REST API
 */
import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { MaterialService, MaterialCategory } from './material.service';

@Controller('material')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  /**
   * 获取内置素材列表
   * GET /api/v1/material/builtin?category=environment
   */
  @Get('builtin')
  getBuiltinMaterials(@Query('category') category?: string) {
    const items = this.materialService.getBuiltinMaterials(
      category ? (category as MaterialCategory) : undefined,
    );
    return {
      data: { items, total: items.length },
      message: '获取成功',
    };
  }

  /**
   * 语义检索素材
   * POST /api/v1/material/search
   */
  @Post('search')
  async searchMaterials(@Body() dto: {
    query: string;
    mode?: string;
    category?: string;
    limit?: number;
  }) {
    try {
      const results = await this.materialService.searchMaterials({
        query: dto.query,
        mode: (dto.mode || 'balanced') as any,
        category: dto.category ? (dto.category as MaterialCategory) : undefined,
        limit: dto.limit || 10,
      });
      return { data: { items: results, total: results.length }, message: '搜索完成' };
    } catch (e: any) {
      return { data: { items: [], total: 0 }, message: e.message || '搜索失败' };
    }
  }
}
