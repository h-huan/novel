import { describe, expect, it } from 'vitest';
import { fictionNarrativeText, prohibitedFictionNames, normalizeGeneratedFictionNames } from '../../shared/src/fiction-naming';
import { applyOrderedIdeaRepairPatches, confirmedIdeaStoryCard, normalizePremiseSelectionPayload } from './idea-discovery-contract';

describe('story naming contract', () => {
  it('rejects the prohibited term even as a pet name and checks nested endings and chapter plans', () => {
    expect(prohibitedFictionNames({ title: '争回宠物', characters: ['豆包'], ending: '接回豆包', scopeBreakdown: [{ outcome: '豆包获救' }] })).toEqual(['豆包']);
    expect(prohibitedFictionNames({ description: '她用chatgpt写出回信' })).toEqual(['ChatGPT']);
    expect(() => confirmedIdeaStoryCard({ title: '争回宠物', ending: '接回豆包' })).toThrow('禁止的故事命名');
    expect(prohibitedFictionNames({ targetPlatform: '抖音', model: 'DeepSeek', ideaDiscoveryAudit: { reasons: ['豆包'] }, title: '她接回小栗' })).toEqual([]);
  });
  it('applies an authorized naming map consistently while preserving metadata and story identity', () => {
    const card = { title: '救回豆包', sourcePremiseId: '豆包-id', characters: ['豆包'], hook: '我把豆包抱回家。',
      ending: '豆包仍留在家中。', scopeBreakdown: [{ arc: '救豆包', outcome: '豆包得救' }], model: 'DeepSeek' };
    const patch = { namingReplacements: { 豆包: '小栗' }, sourcePremiseId: 'forged' };
    expect(applyOrderedIdeaRepairPatches([card], [patch])[0]).toEqual(card);
    const repaired = applyOrderedIdeaRepairPatches([card], [patch], [], [0])[0];
    expect(prohibitedFictionNames(repaired)).toEqual([]);
    expect(fictionNarrativeText(repaired)).toContain('我把小栗抱回家。');
    expect(repaired).toMatchObject({ sourcePremiseId: '豆包-id', model: 'DeepSeek', characters: ['小栗'], ending: '小栗仍留在家中。' });
    expect(card.characters).toEqual(['豆包']);
    expect(() => applyOrderedIdeaRepairPatches([card], [{ namingReplacements: { 豆包: 'DeepSeek' } }], [], [0])).toThrow('原创虚构');
    expect(() => applyOrderedIdeaRepairPatches([card], [{ namingReplacements: { 主角: '换人' } }], [], [0])).toThrow('只能将禁止名称');
  });
  it('blocks a prohibited selected premise before any complete card is created', () => {
    const pool = [{ premiseId: 'P1', workingTitle: '救回宠物', storyCore: '主角必须争回自己的宠物豆包' }];
    expect(() => normalizePremiseSelectionPayload({ pool, selectedPremises: [{ premiseId: 'P1' }] }, 1, 3)).toThrow('禁止的故事命名');
  });
});

it('normalizes every known prohibited narrative name without changing facts or metadata',()=>{
 const originals=['豆包','ChatGPT','DeepSeek','文心一言','通义千问','腾讯元宝','Kimi','美团','饿了么','微信','抖音'];
 const generated={sourcePremiseId:'P1',targetPlatform:'抖音',model:'DeepSeek',
   title:'主角得到了新线索',description:originals.join('、'),characters:[{name:'豆包',role:'朋友'}],
   scopeBreakdown:[{outcome:'微信里保存着证据'}],plannedChapters:8};
 const cleaned=normalizeGeneratedFictionNames(generated);
 expect(prohibitedFictionNames(cleaned)).toEqual([]);
 expect(cleaned).toMatchObject({sourcePremiseId:'P1',targetPlatform:'抖音',model:'DeepSeek',plannedChapters:8});
 expect(cleaned.characters).toEqual([{name:'云芽',role:'朋友'}]);
 expect(cleaned.scopeBreakdown[0].outcome).toContain('青信');
 expect(generated.characters).toEqual([{name:'豆包',role:'朋友'}]);
 expect(normalizeGeneratedFictionNames({title:'无品牌的故事'})).toEqual({title:'无品牌的故事'});
});
