/**
 * 素材库控制器
 *
 * 提供素材库相关 REST API
 */
import { Controller, Get, Query, Post, Body, BadRequestException } from '@nestjs/common';
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
   * 文风分析（真实计算，非模板）
   * POST /api/v1/material/style-analyze
   *
   * 【唯一实现】风格特征只在这里算：MaterialService.analyzeStyle() 依据传入文本本身
   * 计算向量 / 关键词 / 句式特点 / 情感基调。
   * 这里曾经的对口是 chain 模块的 POST /chain/style-vectorize —— 它不读入参样本、
   * 固定返回 dimensions:128 与「对话占比约 35%」等编造特征，已删除
   * （防复发注释见 server/src/chain/chain.controller.ts）。禁止在任何地方再返回硬编码的风格特征。
   */
  @Post('style-analyze')
  analyzeStyle(@Body() dto: { content: string; styleName?: string }) {
    const content = (dto?.content || '').trim();
    if (!content) {
      throw new BadRequestException('请提供真实文本；文风分析不会用示例内容代替。');
    }
    const analysis = this.materialService.analyzeStyle(content);
    return {
      success: true,
      styleName: dto.styleName || '未命名风格',
      analysis,
      message: '基于输入文本的真实统计结果，未使用模板数值',
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
