/**
 * StyleTemplateService - 风格模板加载服务
 * 从 server/data/styles/templates.json 加载7种风格定义
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StyleTemplate {
  styleId: string;
  name: string;
  rules: Record<string, any>;
  qualityGates: Record<string, { threshold: number; onFailure: string }>;
  defaultGoalArc: string;
}

@Injectable()
export class StyleTemplateService {
  private readonly logger = new Logger(StyleTemplateService.name);
  private templates: StyleTemplate[] = [];

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    // 优先查找 dist 路径，其次项目根路径
    const distPath = path.join(__dirname, '../../data/styles/templates.json');
    const rootPath = path.join(process.cwd(), 'data/styles/templates.json');
    const filePath = fs.existsSync(distPath) ? distPath : rootPath;
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.templates = JSON.parse(content) as StyleTemplate[];
        this.logger.log(`已加载 ${this.templates.length} 个风格模板`);
      } else {
        this.logger.warn(`风格模板文件不存在: ${filePath}`);
        this.templates = this.getDefaultTemplates();
      }
    } catch (err) {
      this.logger.error(`加载风格模板失败: ${err}`);
      this.templates = this.getDefaultTemplates();
    }
  }

  getAllTemplates(): StyleTemplate[] {
    return this.templates;
  }

  getTemplate(styleId: string): StyleTemplate | undefined {
    return this.templates.find(t => t.styleId === styleId);
  }

  private getDefaultTemplates(): StyleTemplate[] {
    return [
      { styleId: 'ensemble', name: '群像', rules: { maxPovCharactersPerChapter: 3, dialogueDiversityRequired: true }, qualityGates: { perspectiveClarity: { threshold: 7, onFailure: 'retry' } }, defaultGoalArc: 'suppress_counter' },
      { styleId: 'system', name: '系统', rules: { forceSystemPanelFormat: true, numericalChangesClear: true }, qualityGates: { systemPanelFormatting: { threshold: 8, onFailure: 'retry' } }, defaultGoalArc: 'accumulate_burst' },
      { styleId: 'historical', name: '历史', rules: { timelineStrict: true, characterBasedOnHistory: true }, qualityGates: { timelineAccuracy: { threshold: 8, onFailure: 'retry' } }, defaultGoalArc: 'crisis_resolve' },
      { styleId: 'war', name: '抗战', rules: { weaponAccuracy: true, militaryRankAccuracy: true }, qualityGates: { militaryAccuracy: { threshold: 8, onFailure: 'retry' } }, defaultGoalArc: 'suppress_counter' },
      { styleId: 'urban', name: '都市', rules: { socialDetail: true, careerAuthenticity: true }, qualityGates: { socialRealism: { threshold: 6, onFailure: 'retry' } }, defaultGoalArc: 'accumulate_burst' },
      { styleId: 'fantasy', name: '玄幻', rules: { realmProgressionStrict: true, powerSystemClear: true }, qualityGates: { realmProgression: { threshold: 8, onFailure: 'retry' } }, defaultGoalArc: 'accumulate_burst' },
      { styleId: 'mystery', name: '悬疑', rules: { clueOrderStrict: true, noPrematureReveal: true }, qualityGates: { clueConsistency: { threshold: 8, onFailure: 'retry' } }, defaultGoalArc: 'mist_truth' },
    ];
  }
}
