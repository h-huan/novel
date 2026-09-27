import { describe, expect, it, vi } from 'vitest';
import { IdeaLabService } from './idea-lab.service';

const service = new IdeaLabService({} as any, {} as any, {} as any) as any;

describe('IdeaLabService evidence-based maturity', () => {
  it('scores story evidence only and does not duplicate platform/word-count gates', () => {
    const report = service.computeMaturityReport({
      oneLineHook: '一个足够清晰且可核验的一句话钩子',
      protagonist: '',
      coreConflict: '',
      sellingPoints: [],
      platformFit: '',
      shortStoryFit: '',
    }, 'short_story');

    expect(report).toMatchObject({ evaluatedItems: 6, satisfiedItems: 1, canConvertToProject: false });
    expect(service.computeMaturityScore(report)).toBe(17);
  });

  it('marks a fully evidenced long-novel idea mature without rechecking project execution fields', () => {
    const report = service.computeMaturityReport({
      oneLineHook: '调查员发现失踪案都指向一座不存在的旧车站',
      protagonist: '林川，拒绝接受未经验证结论的调查员',
      coreConflict: '林川必须在秩序封锁前证明旧车站循环真实存在',
      sellingPoints: ['可验证线索链', '人物选择改变调查方向'],
      platformFit: '以连续冲突和章节钩子适配目标平台阅读节奏',
      longNovelFit: '多卷调查推进、人物关系变化和跨卷伏笔支持长篇展开',
      worldSeed: '旧工业城的公开地图与地下交通档案相互矛盾',
    }, 'long_novel');

    expect(report).toMatchObject({ evaluatedItems: 7, satisfiedItems: 7, canConvertToProject: true });
    expect(service.computeMaturityScore(report)).toBe(100);
  });

  it('delegates the hard conversion decision to ProjectService even when the old maturity report is incomplete', () => {
    const row = {
      id: 'idea-1', status: 'refined', project_type: 'short_story', target_platform: 'fanqie',
      custom_platform_note: '', target_words: 10_000, title: '标题', raw_idea: '原始想法',
      confirmed_idea: '确认想法', description: '', refined_idea_json: JSON.stringify({ oneLineHook: '确认想法', titleSuggestions: [] }),
      maturity_report_json: JSON.stringify({ strengths: [], missingItems: ['旧报告缺项'], risks: [], canConvertToProject: false, evaluatedItems: 1, satisfiedItems: 0 }),
    };
    const repo = { findById: vi.fn(() => row), update: vi.fn() };
    const projectService = { create: vi.fn(() => ({ id: 'project-1' })) };
    const instance = new IdeaLabService(repo as any, projectService as any, {} as any);

    const result = instance.convertToProject('idea-1', {
      category: '悬疑', storyTone: ['克制'], writingStyle: ['紧凑'], webNovelGenre: ['悬疑'],
      submissionTags: ['悬疑'], plotTags: ['调查'], genreFitNote: '与悬疑分类核心冲突一致', pov: 'third_person',
    } as any);

    expect(projectService.create).toHaveBeenCalledTimes(1);
    expect(result.projectId).toBe('project-1');
  });
});
