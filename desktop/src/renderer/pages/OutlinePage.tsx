/**
 * OutlinePage - 大纲浏览、生成与章节微调
 *
 * 清理说明：
 * - 保留现有路由、store、后端接口和核心操作。
 * - 移除历史乱码和不可达旧逻辑，避免后续修改误伤正在使用的流程。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useCharacterStore } from '../stores/characterStore';
import { useForeshadowingStore } from '../stores/foreshadowingStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkflowGuardStore } from '../stores/workflowGuardStore';
import WorkflowBlockedNotice from '../components/workflow/WorkflowBlockedNotice';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

type ChapterFunctionType =
  | 'opening'
  | 'breathing'
  | 'charging'
  | 'explosion'
  | 'paving'
  | 'transition'
  | 'closing'
  | 'cliffhanger'
  | 'exposition'
  | 'rising_action'
  | 'conflict'
  | 'climax'
  | 'resolution';
type GoalArcType =
  | 'crisis_resolve'
  | 'accumulate_burst'
  | 'foreshadow_recover'
  | 'pave_climax'
  | 'suppress_counter'
  | 'mist_truth'
  | 'probe_showdown';

interface VolumeNode {
  id: string;
  title: string;
  description: string;
  chapters: ChapterNode[];
  theme?: string;
  goal?: string;
  keyEvents?: string[];
  climaxDescription?: string;
  climax?: string;
  timeline?: { start?: string; end?: string } | null;
}

interface ChapterNode {
  id: string;
  title: string;
  chapterFunction: ChapterFunctionType;
  goalArc: GoalArcType;
  targetWords: number;
  content: string;
  conflict: string;
  mood: string;
  hook: string;
  foreshadowing: string;
  foreshadowingRecovery?: string;
  highlight: string;
  characterIds: string[];
  characterActions?: string | string[];
  scenes?: string[];
  status: 'planned' | 'writing' | 'completed' | 'locked';
  reversals?: any[];
  foreshadows?: any[];
}

const FUNCTION_COLORS: Record<string, string> = {
  opening: '#e94560',
  breathing: '#22c55e',
  charging: '#3b82f6',
  explosion: '#ef4444',
  paving: '#a855f7',
  transition: '#f59e0b',
  closing: '#ec4899',
  cliffhanger: '#f97316',
  exposition: '#60a5fa',
  rising_action: '#38bdf8',
  conflict: '#ef4444',
  climax: '#f43f5e',
  resolution: '#22c55e',
};

const CHAPTER_FUNCTION_LABELS: Record<string, string> = {
  opening: '开篇钩子',
  breathing: '呼吸章',
  charging: '蓄力章',
  explosion: '爆发章',
  paving: '铺垫章',
  transition: '过渡章',
  closing: '收束章',
  cliffhanger: '悬念钩子',
  exposition: '信息揭示',
  rising_action: '危机升级',
  conflict: '正面冲突',
  climax: '高潮章',
  resolution: '收束反转',
};

const GOAL_ARC_LABELS: Record<string, string> = {
  crisis_resolve: '危机到解决',
  accumulate_burst: '积累到爆发',
  foreshadow_recover: '伏笔到回收',
  pave_climax: '铺垫到高潮',
  suppress_counter: '压制到反击',
  mist_truth: '迷雾到真相',
  probe_showdown: '试探到摊牌',
};

const STATUS_LABELS: Record<string, string> = {
  planned: '已规划',
  writing: '写作中',
  completed: '已完成',
  locked: '已锁定',
};

const STATUS_COLORS: Record<string, string> = {
  planned: '#8a8aa0',
  writing: '#f59e0b',
  completed: '#22c55e',
  locked: '#f59e0b',
};

const parseJsonObject = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const splitFieldList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(/[、，,；;\/]/).map(v => v.trim()).filter(Boolean);
};

const parseOutlineContentFields = (content: string, sceneData: Record<string, any>, chapter: any) => {
  const fields: Record<string, string> = {};
  const aliases: Record<string, string> = {
    核心内容: 'core',
    主要场景: 'scenes',
    人物行动: 'actions',
    冲突设计: 'conflict',
    爽点设置: 'highlight',
    伏笔设置: 'foreshadowing',
    伏笔回收: 'foreshadowingRecover',
    下章钩子: 'hook',
    结尾设置: 'hook',
    情绪基调: 'mood',
    反转点: 'reversalPoint',
    目标字数: 'targetWords',
  };
  const labels = Object.keys(aliases).join('|');
  const pattern = new RegExp(`(?:^|\\n)(${labels})[：:]\\s*([\\s\\S]*?)(?=\\n(?:${labels})[：:]|$)`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content || ''))) fields[aliases[match[1]]] = match[2].trim();

  const actions = fields.actions
    || (Array.isArray(sceneData.characterActions) ? sceneData.characterActions.join('、') : sceneData.characterActions)
    || (Array.isArray(chapter.characterActions) ? chapter.characterActions.join('、') : chapter.characterActions)
    || '';

  return {
    core: fields.core || sceneData.core || sceneData.summary || chapter.content || '',
    scenes: splitFieldList(fields.scenes).length > 0 ? splitFieldList(fields.scenes) : splitFieldList(sceneData.scenes || chapter.scenes),
    actions,
    conflict: fields.conflict || sceneData.conflict || chapter.conflict || '',
    highlight: fields.highlight || sceneData.highlight || chapter.highlight || '',
    foreshadowing: fields.foreshadowing || sceneData.foreshadowing || sceneData.foreshadowingSet || chapter.foreshadowing || '',
    foreshadowingRecover: fields.foreshadowingRecover || sceneData.foreshadowingRecover || chapter.foreshadowingRecovery || '',
    hook: fields.hook || sceneData.hook || chapter.hook || '',
    mood: fields.mood || sceneData.mood || sceneData.emotionalTone || chapter.mood || chapter.emotionalTone || '',
    reversalPoint: fields.reversalPoint || sceneData.reversalPoint || chapter.reversalPoint || '',
    targetWordsText: fields.targetWords || '',
  };
};

const formatOutlineFields = (fields: Record<string, any>): string => [
  `核心内容：${fields.core || ''}`,
  `主要场景：${Array.isArray(fields.scenes) ? fields.scenes.join('、') : (fields.scenes || '')}`,
  `人物行动：${fields.actions || ''}`,
  `冲突设计：${fields.conflict || ''}`,
  `爽点设置：${fields.highlight || ''}`,
  `伏笔设置：${fields.foreshadowing || ''}`,
  `伏笔回收：${fields.foreshadowingRecover || ''}`,
  `结尾设置：${fields.hook || ''}`,
  `情绪基调：${fields.mood || ''}`,
  `反转点：${fields.reversalPoint || ''}`,
  `目标字数：${fields.targetWordsText || fields.targetWords || ''}`,
].join('\n');

const chapterPreviewText = (chapter: ChapterNode): string => {
  const parsed = parseOutlineContentFields(chapter.content || '', parseJsonObject((chapter as any).scenes), chapter);
  return parsed.core || chapter.content || '';
};

const parseOutlineScenes = (node: any) => {
  try {
    return typeof node.scenes === 'string'
      ? JSON.parse(node.scenes)
      : (node.scenes && typeof node.scenes === 'object' ? node.scenes : {});
  } catch {
    return {};
  }
};

const normalizeFunction = (value: unknown): ChapterFunctionType => {
  const raw = String(value || '').trim().toLowerCase();
  const map: Record<string, ChapterFunctionType> = {
    open: 'opening',
    opening: 'opening',
    hook: 'opening',
    start: 'opening',
    exposition: 'exposition',
    setup: 'exposition',
    development: 'rising_action',
    rising: 'rising_action',
    rising_action: 'rising_action',
    conflict: 'conflict',
    crisis: 'conflict',
    climax: 'climax',
    explosion: 'explosion',
    payoff: 'explosion',
    resolution: 'resolution',
    ending: 'resolution',
    closing: 'closing',
    cliffhanger: 'cliffhanger',
    transition: 'transition',
    breathing: 'breathing',
    charging: 'charging',
    paving: 'paving',
  };
  return map[raw] || 'paving';
};

const normalizeGoalArc = (value: unknown): GoalArcType => {
  const arc = String(value || 'accumulate_burst');
  return ([
    'crisis_resolve',
    'accumulate_burst',
    'foreshadow_recover',
    'pave_climax',
    'suppress_counter',
    'mist_truth',
    'probe_showdown',
  ].includes(arc) ? arc : 'accumulate_burst') as GoalArcType;
};

const inferRhythmByOrder = (order: number): ChapterFunctionType => {
  const shortRhythm: ChapterFunctionType[] = [
    'opening',
    'exposition',
    'rising_action',
    'conflict',
    'climax',
    'transition',
    'climax',
    'cliffhanger',
    'resolution',
  ];
  if (order >= 1 && order <= shortRhythm.length) return shortRhythm[order - 1];
  const cycle: ChapterFunctionType[] = ['charging', 'conflict', 'explosion', 'breathing', 'paving', 'cliffhanger'];
  return cycle[(Math.max(order, 1) - 1) % cycle.length];
};

const OutlinePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = id || '';
  const { characters, fetchCharacters } = useCharacterStore();
  const { foreshadowings, fetchForeshadowings } = useForeshadowingStore();
  const { currentProject, selectProject } = useProjectStore();
  const checkAction = useWorkflowGuardStore((state) => state.checkAction);

  const [activeView, setActiveView] = useState<'generate' | 'browse'>('browse');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [volumes, setVolumes] = useState<VolumeNode[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedVolumesTmp, setGeneratedVolumesTmp] = useState<VolumeNode[]>([]);
  const [outlineMeta, setOutlineMeta] = useState<Record<string, any>>({});
  const [saveGenerated, setSaveGenerated] = useState(false);
  const [canRegenerate, setCanRegenerate] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [material, setMaterial] = useState('');
  const [platform, setPlatform] = useState('fanqie');
  const [targetWords, setTargetWords] = useState('3000');
  const [workScale, setWorkScale] = useState('ai_recommended');
  const [targetWordsRange, setTargetWordsRange] = useState('');
  const [chapterWordsMode, setChapterWordsMode] = useState('platform_default');
  const [volumeMode, setVolumeMode] = useState('ai_recommended');
  const [chaptersPerVolumeMode, setChaptersPerVolumeMode] = useState('dynamic');
  const [updatePlan, setUpdatePlan] = useState('daily_words');
  const [generateCount, setGenerateCount] = useState('5');
  const [tone, setTone] = useState('neutral');
  const [blockedNotice, setBlockedNotice] = useState<{
    reason: string;
    missingAssets: string[];
    recommendedNextAction?: string;
  } | null>(null);

  const projectType = currentProject?.type === 'long_novel' ? 'long' : 'short';

  const toChapterNode = useCallback((ch: any): ChapterNode => {
    const sceneData = parseOutlineScenes(ch);
    const order = Number(ch.order || ch.chapterNumber || ch.chapter_index || 0);
    const rawFunction = ch.chapterFunction || ch.chapter_function || sceneData.chapterFunction || ch.function;
    const normalizedFunction = normalizeFunction(rawFunction);
    return {
      id: ch.id,
      title: ch.title || '未命名章节',
      chapterFunction: normalizedFunction === 'paving' && order > 0 ? inferRhythmByOrder(order) : normalizedFunction,
      goalArc: normalizeGoalArc(ch.goalArc || ch.goal_arc || sceneData.goalArc),
      targetWords: Number(ch.targetWords || ch.target_words || sceneData.targetWords || 3000),
      content: ch.content || '',
      conflict: sceneData.conflict || ch.conflict || '',
      mood: sceneData.emotionalTone || sceneData.mood || ch.mood || '',
      hook: sceneData.hook || ch.hook || '',
      foreshadowing: sceneData.foreshadowing || sceneData.foreshadowingSet || ch.foreshadowing || '',
      foreshadowingRecovery: sceneData.foreshadowingRecover || ch.foreshadowingRecovery || '',
      highlight: sceneData.highlight || ch.highlight || '',
      characterIds: ch.characterIds || ch.character_ids || [],
      characterActions: sceneData.characterActions || ch.characterActions || '',
      scenes: Array.isArray(sceneData.scenes) ? sceneData.scenes : splitFieldList(sceneData.scenes || ch.scenes),
      status: ch.status || 'planned',
      reversals: sceneData.reversals || ch.reversals || [],
      foreshadows: sceneData.foreshadows || ch.foreshadows || [],
    };
  }, []);

  const toVolumeNode = useCallback((item: any): VolumeNode => {
    const volumeData = parseOutlineScenes(item);
    const children = (item.children || item.chapters || []).filter((child: any) => child.level !== 'volume');
    return {
      id: item.id,
      title: item.title || '正文',
      description: item.content || item.description || '',
      chapters: children.map(toChapterNode),
      theme: volumeData.theme || item.volumeTheme || '',
      goal: volumeData.goal || item.volumeGoal || item.content || '',
      keyEvents: volumeData.keyEvents || item.keyEvents || [],
      climax: volumeData.climax || item.volumeClimax || '',
      climaxDescription: volumeData.climaxDescription || item.climaxDescription || '',
      timeline: volumeData.timeline || null,
    };
  }, [toChapterNode]);

  const normalizeOutlineTree = useCallback((outlineData: any[]): VolumeNode[] => {
    const normalized: VolumeNode[] = [];
    for (const item of outlineData) {
      if (item.level === 'book') {
        const childVolumes = (item.children || []).filter((child: any) => child.level === 'volume');
        if (childVolumes.length > 0) normalized.push(...childVolumes.map(toVolumeNode));
        else normalized.push(toVolumeNode({ ...item, title: `${item.title || '全书'}：正文` }));
      } else if (item.level === 'volume') {
        normalized.push(toVolumeNode(item));
      } else if (item.level === 'chapter') {
        normalized.push({ id: `${item.id}-volume`, title: '正文', description: '', chapters: [toChapterNode(item)] });
      }
    }
    return normalized;
  }, [toChapterNode, toVolumeNode]);

  const loadVolumes = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [outlineRes] = await Promise.all([
        api.get(`/projects/${projectId}/outlines/tree`),
        fetchCharacters(projectId),
        fetchForeshadowings(projectId),
        selectProject(projectId),
      ]);
      const outlineData = (outlineRes as any).data ?? outlineRes;
      const transformed = Array.isArray(outlineData) ? normalizeOutlineTree(outlineData) : [];
      setVolumes(transformed);
      if (transformed.length > 0 && transformed[0].chapters.length > 0) {
        setSelectedChapterId(current => current && transformed.some(v => v.chapters.some(c => c.id === current)) ? current : transformed[0].chapters[0].id);
      } else {
        setSelectedChapterId(null);
      }
    } catch {
      setVolumes([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, fetchCharacters, fetchForeshadowings, selectProject, normalizeOutlineTree]);

  useEffect(() => { loadVolumes(); }, [loadVolumes]);

  const selectedChapter = useMemo(
    () => volumes.flatMap(v => v.chapters).find(ch => ch.id === selectedChapterId) || null,
    [volumes, selectedChapterId],
  );

  const selectedVolume = useMemo(
    () => volumes.find(v => v.chapters.some(ch => ch.id === selectedChapterId)) || null,
    [volumes, selectedChapterId],
  );

  const chapterContext = useMemo(() => {
    const rows = volumes.flatMap(volume => volume.chapters.map((chapter, index) => ({ volume, chapter, index })));
    const currentIndex = rows.findIndex(row => row.chapter.id === selectedChapterId);
    if (currentIndex === -1) return null;
    return { previous: rows[currentIndex - 1] || null, current: rows[currentIndex], next: rows[currentIndex + 1] || null };
  }, [volumes, selectedChapterId]);

  const chapterCharactersGrouped = useMemo(() => {
    if (!selectedChapter?.characterIds?.length || characters.length === 0) return null;
    const ids = selectedChapter.characterIds;
    const groups: Record<string, any[]> = { protagonist: [], major: [], supporting: [], minor: [] };
    for (const c of characters.filter((item: any) => ids.includes(item.id))) {
      const role = c.role || 'supporting';
      if (groups[role]) groups[role].push(c);
      else groups.supporting.push(c);
    }
    return groups;
  }, [selectedChapter, characters]);

  const chapterForeshadowingsGrouped = useMemo(() => {
    if (!selectedChapter) return null;
    const localItems = selectedChapter.foreshadows || [];
    const items = localItems.length > 0 ? localItems : foreshadowings.filter((item: any) => {
      const buried = item.buriedChapterIndex ?? item.buried_chapter_index;
      const recovery = item.plannedRecoveryChapterIndex ?? item.planned_recovery_chapter_index;
      const order = chapterContext?.current?.index ? chapterContext.current.index + 1 : undefined;
      return order ? buried === order || recovery === order : false;
    });
    const groups: Record<string, any[]> = { global: [], volume: [], chapter: [] };
    for (const item of items) {
      const scope = item.scope || 'chapter';
      if (!groups[scope]) groups[scope] = [];
      groups[scope].push(item);
    }
    return groups;
  }, [selectedChapter, foreshadowings, chapterContext]);

  const refreshAfterChange = useCallback(async (nextSelectedId?: string) => {
    await loadVolumes();
    if (nextSelectedId) setSelectedChapterId(nextSelectedId);
    setSyncMessage('当前仅提供伏笔章节索引基础同步能力；时间线、角色状态、未锁定正文会生成待确认影响项，需要人工复核。');
  }, [loadVolumes]);

  const saveGeneratedOutline = useCallback(async (volumesToSave: VolumeNode[], meta: Record<string, any>) => {
    if (!projectId || volumesToSave.length === 0) return;
    let totalChapters = 0;

    if (Object.keys(meta).length > 0) {
      try {
        const projectRes = await api.get(`/projects/${projectId}`);
        const projectData = (projectRes as any).data ?? projectRes;
        const project = projectData?.data || projectData || {};
        let settings: Record<string, any> = {};
        try { settings = typeof project.settings === 'string' ? JSON.parse(project.settings) : (project.settings || {}); } catch {}
        Object.assign(settings, meta);
        await api.put(`/projects/${projectId}`, { settings: JSON.stringify(settings) });
      } catch {}
    }

    const summary = volumesToSave.map((volume, index) => {
      const chapters = volume.chapters.map((chapter, chapterIndex) => `${chapterIndex + 1}. ${chapter.title}`).join('\n');
      return `第${index + 1}卷：${volume.title}\n${volume.description || volume.goal || ''}\n${chapters}`;
    }).join('\n\n');

    const bookRes = await api.post(`/projects/${projectId}/outlines`, {
      level: 'book',
      parentId: null,
      order: 1,
      title: '全书总纲',
      content: summary || '根据 AI 生成结果汇总出的全书总纲。',
      scenes: {
        coreSetting: meta.coreSetting || {},
        worldview: meta.worldview || null,
        timeline: meta.timeline || [],
        reversals: meta.reversals || [],
        summary,
      },
    });
    const bookData = (bookRes as any).data ?? bookRes;
    const bookId = bookData?.id || bookData?.data?.id;
    if (!bookId) {
      throw new Error('总纲节点保存失败，请重新生成或稍后重试。');
    }

    for (const [volumeIndex, volume] of volumesToSave.entries()) {
      const volumeRes = await api.post(`/projects/${projectId}/outlines`, {
        level: 'volume',
        parentId: bookId,
        order: volumeIndex + 1,
        title: volume.title,
        content: volume.description || volume.goal || '',
        scenes: {
          theme: volume.theme || volume.title,
          goal: volume.goal || volume.description || '',
          keyEvents: volume.keyEvents || [],
          climax: volume.climaxDescription || volume.climax || '',
          timeline: volume.timeline || null,
        },
      });
      const volumeData = (volumeRes as any).data ?? volumeRes;
      const volumeId = volumeData?.id || volumeData?.data?.id;
      if (!volumeId) continue;

      for (const [chapterIndex, chapter] of volume.chapters.entries()) {
        await api.post(`/projects/${projectId}/outlines`, {
          level: 'chapter',
          parentId: volumeId,
          order: chapterIndex + 1,
          title: chapter.title,
          content: chapter.content || '',
          chapterFunction: normalizeFunction(chapter.chapterFunction) === 'paving'
            ? inferRhythmByOrder(chapterIndex + 1)
            : normalizeFunction(chapter.chapterFunction),
          goalArc: chapter.goalArc || 'accumulate_burst',
          targetWords: chapter.targetWords || 3000,
          characterIds: chapter.characterIds || [],
          scenes: {
            conflict: chapter.conflict || '',
            scenes: chapter.scenes || [],
            hook: chapter.hook || '',
            foreshadowing: chapter.foreshadowing || '',
            foreshadowingRecover: chapter.foreshadowingRecovery || '',
            highlight: chapter.highlight || '',
            mood: chapter.mood || '',
            characterActions: chapter.characterActions || '',
            reversals: chapter.reversals || [],
            foreshadows: chapter.foreshadows || [],
          },
        });
        totalChapters += 1;
      }
    }

    try {
      const projectRes = await api.get(`/projects/${projectId}`);
      const projectData = (projectRes as any).data ?? projectRes;
      const project = projectData?.data || projectData || {};
      let settings: Record<string, any> = {};
      try { settings = typeof project.settings === 'string' ? JSON.parse(project.settings) : (project.settings || {}); } catch {}
      settings.totalChapters = totalChapters;
      settings.totalVolumes = volumesToSave.length;
      await api.put(`/projects/${projectId}`, { settings: JSON.stringify(settings) });
    } catch {}
  }, [projectId]);

  const mapGeneratedChapter = (chapter: any, index: number, total: number): ChapterNode => {
    const content = chapter.content || chapter.summary || chapter.description || '';
    return {
      id: `generated-ch-${index + 1}`,
      title: chapter.title || chapter.chapterTitle || `第${index + 1}章`,
      chapterFunction: normalizeFunction(chapter.chapterFunction || chapter.function) === 'paving'
        ? inferRhythmByOrder(index + 1)
        : normalizeFunction(chapter.chapterFunction || chapter.function),
      goalArc: normalizeGoalArc(chapter.goalArc),
      targetWords: Number(chapter.targetWords || Math.max(1000, Math.floor(Number(targetWords || 3000) / Math.max(total, 1)))),
      content,
      conflict: chapter.conflict || '',
      mood: chapter.mood || chapter.tone || chapter.emotion || '',
      hook: chapter.hook || chapter.endingHook || chapter.nextHook || '',
      foreshadowing: chapter.foreshadowing || '',
      foreshadowingRecovery: chapter.foreshadowingRecovery || chapter.foreshadowingRecover || '',
      highlight: chapter.highlight || '',
      characterIds: chapter.characterIds || [],
      characterActions: chapter.characterActions || '',
      scenes: Array.isArray(chapter.scenes) ? chapter.scenes : splitFieldList(chapter.scenes),
      status: 'planned',
      reversals: chapter.reversals || [],
      foreshadows: chapter.foreshadows || chapter.foreshadowItems || [],
    };
  };

  const normalizeGeneratedOutline = (outlineData: any): { volumes: VolumeNode[]; meta: Record<string, any> } => {
    let data = outlineData;
    if (data && !data.volumes && !data.chapters) {
      const nodeKey = Object.keys(data).find(key => key.startsWith('node_1'));
      if (nodeKey && typeof data[nodeKey] === 'object') data = { ...data[nodeKey], _nodeKey: nodeKey };
    }

    const meta = {
      coreSetting: data?.coreSetting || data?.outline?.coreSetting || {},
      timeline: data?.timeline || data?.outline?.timeline || [],
      reversals: data?.reversals || data?.outline?.reversals || [],
      worldview: data?.worldview || data?.outline?.worldview || null,
      outlineCharacters: data?.characters || data?.outline?.characters || [],
      outlineForeshadowings: data?.foreshadowings || data?.outline?.foreshadowings || [],
    };

    if (Array.isArray(data?.volumes)) {
      const total = data.volumes.reduce((sum: number, volume: any) => sum + (volume.chapters || []).length, 0);
      return {
        meta,
        volumes: data.volumes.map((volume: any, volumeIndex: number) => ({
          id: `generated-vol-${volumeIndex + 1}`,
          title: volume.volumeTitle || volume.title || `第${volumeIndex + 1}卷`,
          description: volume.description || volume.outline || volume.theme || '',
          theme: volume.theme || volume.volumeTheme || '',
          goal: volume.goal || volume.volumeGoal || volume.description || '',
          keyEvents: volume.keyEvents || [],
          climaxDescription: volume.climaxDescription || volume.climax || '',
          timeline: volume.timeline || null,
          chapters: (volume.chapters || []).map((chapter: any, chapterIndex: number) => mapGeneratedChapter(chapter, chapterIndex, total)),
        })),
      };
    }

    const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
    return {
      meta,
      volumes: chapters.length > 0 ? [{
        id: 'generated-vol-1',
        title: data?.title || '正文',
        description: data?.summary || '',
        chapters: chapters.map((chapter: any, index: number) => mapGeneratedChapter(chapter, index, chapters.length)),
      }] : [],
    };
  };

  const handleGenerateOutline = useCallback(async () => {
    if (!projectId) return;
    const guard = await checkAction(projectId, 'generate_outline');
    if (!guard.allowed) {
      setBlockedNotice({
        reason: guard.reason || '当前阶段不能生成大纲',
        missingAssets: guard.missingAssets,
        recommendedNextAction: guard.recommendedNextAction,
      });
      return;
    }
    setBlockedNotice(null);
    setIsGenerating(true);
    setSaveGenerated(false);
    setCanRegenerate(false);
    setGenProgress('正在生成大纲...');

    try {
      const result = await api.post('/chain/templates/execute/long-novel-flexible-outline', {
        userInput: {
          projectId,
          story_setting: material || '自动生成',
          targetWords: targetWordsRange || Math.max(1, Number(targetWords || 3000) / 10000),
          genre: tone || platform || '自动判断',
          chapterLimit: generateCount === 'remaining' ? undefined : generateCount,
          planning: {
            workScale,
            targetWordsRange,
            chapterWordsMode,
            volumeMode,
            chaptersPerVolumeMode,
            updatePlan,
            generateCount,
            shortStoryFlow: projectType === 'short'
              ? ['题材钩子', '完整第一人称大纲', '递进反转表', '伏笔回收表', '每章天龙8步法', '前300-500字强吸引']
              : [],
            ultraLongReferenceOnly: true,
          },
        },
      });
      const data = (result as any).data ?? result;
      const normalized = normalizeGeneratedOutline(data.outputs || data);
      if (normalized.volumes.length === 0) {
        setGenProgress('大纲生成完成，但没有解析到可保存的章节结构。');
        setCanRegenerate(true);
        return;
      }
      setGeneratedVolumesTmp(normalized.volumes);
      setOutlineMeta(normalized.meta);
      setVolumes(normalized.volumes);
      setSelectedChapterId(normalized.volumes[0]?.chapters[0]?.id || null);
      setSaveGenerated(true);
      setCanRegenerate(true);
      setActiveView('browse');
      setGenProgress(`大纲生成完成：${normalized.volumes.length}卷，${normalized.volumes.reduce((sum, v) => sum + v.chapters.length, 0)}章。请保存或重新生成。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败';
      setGenProgress(`大纲生成失败：${message}`);
      setCanRegenerate(true);
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, material, platform, targetWords, targetWordsRange, tone, generateCount, workScale, chapterWordsMode, volumeMode, chaptersPerVolumeMode, updatePlan, projectType, checkAction]);

  const handleSaveGenerated = useCallback(async () => {
    setGenProgress('正在保存大纲...');
    try {
      await saveGeneratedOutline(generatedVolumesTmp, outlineMeta);
      setSaveGenerated(false);
      setGeneratedVolumesTmp([]);
      setGenProgress('大纲已保存。');
      await loadVolumes();
    } catch (error) {
      const message = error instanceof Error ? error.message : '大纲保存失败，请稍后重试。';
      setGenProgress(message);
    }
  }, [generatedVolumesTmp, outlineMeta, saveGeneratedOutline, loadVolumes]);

  const handleSplitChapter = useCallback(async (_volumeId: string, chapterId: string) => {
    if (!projectId) return;
    const chapter = volumes.flatMap(v => v.chapters).find(item => item.id === chapterId);
    const parsed = chapter ? parseOutlineContentFields(chapter.content || '', parseJsonObject((chapter as any).scenes), chapter) : null;
    const newTitle = window.prompt('拆分后新章节标题（建议只拆内容过多的一章，降低对角色/伏笔/正文的影响）', chapter ? `${chapter.title}（下）` : '新章节');
    if (!newTitle?.trim()) return;
    try {
      const res = await api.post(`/projects/${projectId}/outlines/${chapterId}/split`, {
        newTitle: newTitle.trim(),
        newContent: parsed ? formatOutlineFields({
          ...parsed,
          core: `承接上一章未完成的动作与后果，继续展开：${parsed.core || chapter?.content || ''}`.slice(0, 260),
          hook: parsed.hook || '保留一个尚未解释的细节，牵引下一章。',
        }) : '',
      });
      const data = (res as any).data ?? res;
      await refreshAfterChange(data?.new?.id);
    } catch (error: any) {
      alert(`拆分失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, volumes, refreshAfterChange]);

  const handleDeleteChapter = useCallback(async (_volumeId: string, chapterId: string) => {
    if (!projectId) return;
    if (!window.confirm('确定删除此章节？已锁定章节不会被删除。删除后会同步偏移后续伏笔章节号。')) return;
    try {
      await api.delete(`/projects/${projectId}/outlines/${chapterId}`);
      await refreshAfterChange();
    } catch (error: any) {
      alert(`删除失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, refreshAfterChange]);

  const handleAddChapter = useCallback(async (volumeId: string) => {
    if (!projectId) return;
    const volume = volumes.find(item => item.id === volumeId);
    const order = (volume?.chapters.length || 0) + 1;
    try {
      const res = await api.post(`/projects/${projectId}/outlines`, {
        level: 'chapter',
        parentId: volumeId,
        order,
        title: `第${order}章：新章节`,
        content: formatOutlineFields({
          core: '请补入本章具体事件链：人物在具体地点做出选择，产生误判或代价。',
          scenes: [],
          actions: '补入人物动作与态度变化。',
          conflict: '补入外部阻力与内在矛盾。',
          highlight: '补入一个可感知的细节或爽点。',
          foreshadowing: '补入需要埋设的短线伏笔。',
          foreshadowingRecover: '',
          hook: '补入下一章牵引。',
          mood: '',
          reversalPoint: '',
          targetWords: 3000,
        }),
        chapterFunction: inferRhythmByOrder(order),
        goalArc: normalizeGoalArc('accumulate_burst'),
        targetWords: 3000,
      });
      const data = (res as any).data ?? res;
      await refreshAfterChange(data?.id || data?.data?.id);
    } catch (error: any) {
      alert(`新增失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, volumes, refreshAfterChange]);

  const handleInsertChapter = useCallback(async (chapterId: string, position: 'before' | 'after') => {
    if (!projectId) return;
    const title = window.prompt(position === 'before' ? '插入前：新章节标题' : '插入后：新章节标题', '新章节细纲');
    if (!title?.trim()) return;
    try {
      const res = await api.post(`/projects/${projectId}/outlines/${chapterId}/insert`, {
        position,
        title: title.trim(),
      });
      const data = (res as any).data ?? res;
      await refreshAfterChange(data?.id);
    } catch (error: any) {
      alert(`插入失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, refreshAfterChange]);

  const handleMergeNext = useCallback(async (chapterId: string) => {
    if (!projectId) return;
    if (!window.confirm('确定将本章与下一章合并？已锁定节点不会被合并，正文不会被自动改写。')) return;
    try {
      const res = await api.post(`/projects/${projectId}/outlines/${chapterId}/merge-next`, {});
      const data = (res as any).data ?? res;
      await refreshAfterChange(data?.id || chapterId);
    } catch (error: any) {
      alert(`合并失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, refreshAfterChange]);

  const handleMoveOrder = useCallback(async (chapterId: string, direction: 'up' | 'down') => {
    if (!projectId) return;
    try {
      const res = await api.post(`/projects/${projectId}/outlines/${chapterId}/move-order`, { direction });
      const data = (res as any).data ?? res;
      await refreshAfterChange(data?.id || chapterId);
    } catch (error: any) {
      alert(`排序失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, refreshAfterChange]);

  const handleContinueCreate = useCallback(async (count: number) => {
    if (!projectId) return;
    try {
      const res = await api.post(`/projects/${projectId}/outlines/continue`, {
        fromOutlineId: selectedChapter?.id,
        count,
        planning: {
          workScale,
          targetWordsRange,
          chapterWordsMode,
          volumeMode,
          chaptersPerVolumeMode,
          updatePlan,
        },
      });
      const data = (res as any).data ?? res;
      const last = data?.outlines?.[data.outlines.length - 1];
      await refreshAfterChange(last?.id);
      setGenProgress(`已续创建 ${data?.outlines?.length || count} 章细纲。`);
    } catch (error: any) {
      alert(`续创建失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, selectedChapter, workScale, targetWordsRange, chapterWordsMode, volumeMode, chaptersPerVolumeMode, updatePlan, refreshAfterChange]);

  const handleExpandChapter = useCallback(async () => {
    if (!projectId || !selectedChapter) return;
    const sceneData = parseJsonObject((selectedChapter as any).scenes);
    const docFields = parseOutlineContentFields(selectedChapter.content || '', sceneData, selectedChapter);
    const expandedDraft = formatOutlineFields({
      ...docFields,
      core: docFields.core || `${selectedChapter.title}需要补足具体事件链：谁在何处做了什么、误判了什么、留下什么后果。`,
      actions: docFields.actions || '补充主要人物的选择、犹豫、遮掩和代价。',
      conflict: docFields.conflict || '补充外部阻力与人物内心偏差，避免只有顺滑推进。',
      highlight: docFields.highlight || '补充一个可被读者记住的具体物件、动作或反常细节。',
      foreshadowing: docFields.foreshadowing || '补充一个短线线索，并标明后续回收位置。',
      hook: docFields.hook || '用一个未说透的细节牵引下一章。',
      targetWords: selectedChapter.targetWords || 3000,
    });
    try {
      await api.put(`/projects/${projectId}/outlines/${selectedChapter.id}`, { content: expandedDraft });
      setGenProgress('已生成更完整的章节大纲草稿，请再手动微调关键细节。');
      await refreshAfterChange(selectedChapter.id);
    } catch {
      setGenProgress('章节大纲扩写失败，请检查模型或接口配置。');
    }
  }, [projectId, selectedChapter, refreshAfterChange]);

  const renderContextPanel = () => {
    if (!selectedChapter || !chapterContext) return null;
    const roleLabels: Record<string, string> = {
      protagonist: '全书贯穿',
      major: '卷级核心',
      supporting: '阶段辅助',
      minor: '短线功能',
    };
    const fsLabels: Record<string, string> = {
      global: '全书伏笔',
      volume: '本卷伏笔',
      chapter: '本章伏笔',
    };
    const renderChapterLink = (label: string, row: typeof chapterContext.previous) => (
      <button
        type="button"
        disabled={!row}
        onClick={() => row && setSelectedChapterId(row.chapter.id)}
        style={{ ...styles.contextLink, opacity: row ? 1 : 0.45, cursor: row ? 'pointer' : 'default' }}
      >
        <span style={styles.contextLinkLabel}>{label}</span>
        <span style={styles.contextLinkTitle}>{row ? row.chapter.title : '无'}</span>
        {row?.chapter.hook && <span style={styles.contextLinkHint}>{row.chapter.hook}</span>}
      </button>
    );

    return (
      <div style={styles.contextPanel}>
        <div style={styles.contextGrid}>
          {renderChapterLink('上一章遗留', chapterContext.previous)}
          <div style={{ ...styles.contextLink, borderColor: 'rgba(233,69,96,0.28)', backgroundColor: 'rgba(233,69,96,0.08)' }}>
            <span style={styles.contextLinkLabel}>本章承接</span>
            <span style={{ ...styles.contextLinkTitle, color: '#e94560' }}>{selectedChapter.title}</span>
            {selectedVolume?.goal && <span style={styles.contextLinkHint}>{selectedVolume.goal}</span>}
          </div>
          {renderChapterLink('下一章牵引', chapterContext.next)}
        </div>

        <div style={styles.contextMetaGrid}>
          <div style={styles.contextMetaBox}>
            <span style={styles.contextMetaTitle}>父卷目标</span>
            <p style={styles.contextMetaText}>{selectedVolume?.goal || selectedVolume?.description || '暂无卷目标'}</p>
            {selectedVolume?.keyEvents && selectedVolume.keyEvents.length > 0 && (
              <p style={styles.contextMetaHint}>{selectedVolume.keyEvents.slice(0, 5).join(' / ')}</p>
            )}
          </div>
          <div style={styles.contextMetaBox}>
            <span style={styles.contextMetaTitle}>相关角色</span>
            {chapterCharactersGrouped ? (
              <div style={styles.contextTagWrap}>
                {Object.entries(chapterCharactersGrouped).flatMap(([role, rows]) =>
                  rows.map((character: any) => (
                    <span key={character.id} style={styles.contextTag}>
                      {character.name}<em style={styles.contextTagEm}>{roleLabels[role] || role}</em>
                    </span>
                  )),
                )}
              </div>
            ) : <p style={styles.contextMetaText}>暂无角色关联</p>}
          </div>
          <div style={styles.contextMetaBox}>
            <span style={styles.contextMetaTitle}>相关伏笔</span>
            {chapterForeshadowingsGrouped ? (
              <div style={styles.contextTagWrap}>
                {Object.entries(chapterForeshadowingsGrouped).flatMap(([scope, rows]) =>
                  rows.map((item: any, index) => (
                    <span key={item.id || `${scope}-${index}`} style={styles.contextTag}>
                      {(item.content || item.description || '').slice(0, 28) || '伏笔'}
                      <em style={styles.contextTagEm}>{fsLabels[scope] || scope}</em>
                    </span>
                  )),
                )}
              </div>
            ) : <p style={styles.contextMetaText}>暂无伏笔关联</p>}
          </div>
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedChapter) return null;
    const sceneData = parseJsonObject((selectedChapter as any).scenes);
    const docFields = parseOutlineContentFields(selectedChapter.content || '', sceneData, selectedChapter);
    const parentVolume = volumes.find(volume => volume.chapters.some(chapter => chapter.id === selectedChapter.id));
    const coreLength = (docFields.core || '').replace(/\s/g, '').length;
    const outlineQuality = [
      { label: '核心内容', ok: coreLength >= 120, hint: `${coreLength}字，建议120-220字` },
      { label: '主要场景', ok: docFields.scenes.length >= 2, hint: `${docFields.scenes.length}个，建议2-3个` },
      { label: '人物行动', ok: !!docFields.actions && docFields.actions.length >= 20, hint: docFields.actions ? '已填写' : '缺失' },
      { label: '冲突/代价', ok: !!docFields.conflict && docFields.conflict.length >= 20, hint: docFields.conflict ? '已填写' : '缺失' },
      { label: '伏笔/钩子', ok: !!docFields.foreshadowing || !!docFields.hook, hint: docFields.foreshadowing || docFields.hook ? '已填写' : '缺失' },
    ];

    return (
      <div style={styles.detailCard}>
        {parentVolume && (parentVolume.keyEvents?.length || parentVolume.climaxDescription || parentVolume.description) && (
          <div style={styles.volumeMetaStrip}>
            <div style={styles.volumeMetaTitle}>{parentVolume.title}</div>
            {parentVolume.description && <div style={styles.volumeMetaLine}>主题：{parentVolume.description}</div>}
            {parentVolume.keyEvents?.length ? <div style={styles.volumeMetaHint}>关键事件：{parentVolume.keyEvents.slice(0, 8).join(' -> ')}</div> : null}
            {parentVolume.climaxDescription && <div style={styles.volumeMetaClimax}>高潮：{parentVolume.climaxDescription}</div>}
          </div>
        )}

        <div style={styles.detailHeader}>
          <h2 style={styles.detailTitle}>{selectedChapter.title}</h2>
          <div style={styles.detailMeta}>
            <span style={{ color: STATUS_COLORS[selectedChapter.status] }}>{STATUS_LABELS[selectedChapter.status] || selectedChapter.status}</span>
            <span style={{ ...styles.fnBadge, color: FUNCTION_COLORS[selectedChapter.chapterFunction] || '#6c6c80', borderColor: FUNCTION_COLORS[selectedChapter.chapterFunction] || 'rgba(255,255,255,0.08)' }}>
              {CHAPTER_FUNCTION_LABELS[selectedChapter.chapterFunction] || selectedChapter.chapterFunction}
            </span>
            <span style={{ color: '#a855f7' }}>{GOAL_ARC_LABELS[selectedChapter.goalArc] || selectedChapter.goalArc}</span>
            {docFields.mood && <span style={{ color: '#f59e0b' }}>{docFields.mood}</span>}
            <span style={{ color: '#22c55e' }}>{selectedChapter.targetWords}字</span>
          </div>
        </div>

        <div style={styles.operationBar}>
          <button type="button" style={styles.operationButton} onClick={handleExpandChapter}>AI扩写</button>
          <button type="button" style={styles.operationButton} onClick={() => { setEditingContentId(selectedChapter.id); setEditContent(formatOutlineFields(docFields)); }}>手动微调</button>
          <button type="button" style={styles.operationButton} onClick={() => selectedVolume && handleSplitChapter(selectedVolume.id, selectedChapter.id)}>拆分本章</button>
          <button type="button" style={styles.operationButton} onClick={() => handleMergeNext(selectedChapter.id)}>合并下一章</button>
          <button type="button" style={styles.operationButton} onClick={() => handleInsertChapter(selectedChapter.id, 'before')}>插入前</button>
          <button type="button" style={styles.operationButton} onClick={() => handleInsertChapter(selectedChapter.id, 'after')}>插入后</button>
          <button type="button" style={styles.operationButton} onClick={() => handleMoveOrder(selectedChapter.id, 'up')}>上移</button>
          <button type="button" style={styles.operationButton} onClick={() => handleMoveOrder(selectedChapter.id, 'down')}>下移</button>
          <button type="button" style={styles.operationButton} onClick={() => selectedVolume && handleAddChapter(selectedVolume.id)}>新增章节</button>
          <button type="button" style={{ ...styles.operationButton, color: '#ef4444', borderColor: 'rgba(239,68,68,0.24)' }} onClick={() => selectedVolume && handleDeleteChapter(selectedVolume.id, selectedChapter.id)}>删除</button>
        </div>
        <div style={styles.impactNotice}>
          影响提示：当前仅提供伏笔章节索引基础同步能力；时间线、角色状态、未锁定正文会生成待确认影响项，需要人工复核。
        </div>
        <div style={styles.impactNotice}>
          续创建：
          {[1, 2, 5, 10].map(count => (
            <button key={count} type="button" style={{ ...styles.operationButton, marginLeft: 8 }} onClick={() => handleContinueCreate(count)}>
              续 {count} 章
            </button>
          ))}
        </div>
        <div style={styles.qualityPanel}>
          <div style={styles.qualityTitle}>章节大纲完整度</div>
          <div style={styles.qualityList}>
            {outlineQuality.map(item => (
              <span key={item.label} style={{ ...styles.qualityBadge, borderColor: item.ok ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.28)', color: item.ok ? '#22c55e' : '#f59e0b' }}>
                {item.label}: {item.ok ? '通过' : item.hint}
              </span>
            ))}
          </div>
          <div style={styles.qualityHint}>AI扩写会先补足结构化草稿，手动微调用来改关键细节；保存后只刷新大纲和索引，不直接改已锁定正文。</div>
        </div>
        {syncMessage && <div style={styles.syncNotice}>{syncMessage}</div>}

        {renderContextPanel()}

        <div style={styles.detailBody}>
          <div style={styles.detailSection}>
            <div style={styles.sectionHeader}>
              <span style={styles.detailLabel}>核心内容</span>
              <button
                type="button"
                onClick={() => {
                  if (editingContentId === selectedChapter.id) setEditingContentId(null);
                  else {
                    setEditingContentId(selectedChapter.id);
                    setEditContent(selectedChapter.content || '');
                  }
                }}
                style={styles.inlineButton}
              >
                {editingContentId === selectedChapter.id ? '取消' : '编辑'}
              </button>
            </div>
            {editingContentId === selectedChapter.id ? (
              <div>
                <textarea value={editContent} onChange={event => setEditContent(event.target.value)} style={styles.editTextarea} />
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.put(`/projects/${projectId}/outlines/${selectedChapter.id}`, { content: editContent });
                        setEditingContentId(null);
                        await refreshAfterChange(selectedChapter.id);
                      } catch {
                        setGenProgress('保存章节大纲失败。');
                      }
                    }}
                    style={styles.primarySmallButton}
                  >
                    保存
                  </button>
                  <button type="button" onClick={() => setEditingContentId(null)} style={styles.secondarySmallButton}>取消</button>
                </div>
              </div>
            ) : (
              <p style={styles.detailText}>{docFields.core || '暂无内容'}</p>
            )}
          </div>

          {docFields.scenes.length > 0 && (
            <div style={styles.detailSection}>
              <span style={styles.detailLabel}>主要场景</span>
              <div style={styles.tagWrap}>{docFields.scenes.map((scene, index) => <span key={index} style={styles.sceneTag}>{scene}</span>)}</div>
            </div>
          )}

          {docFields.actions && <DocSection label="人物行动" text={docFields.actions} />}
          {docFields.conflict && <DocSection label="冲突设计" text={docFields.conflict} tone="danger" />}
          {docFields.highlight && <DocSection label="爽点设置" text={docFields.highlight} tone="warm" />}
          {docFields.foreshadowing && <DocSection label="伏笔设置" text={docFields.foreshadowing} tone="purple" />}
          {docFields.foreshadowingRecover && <DocSection label="伏笔回收" text={docFields.foreshadowingRecover} tone="green" />}
          {docFields.hook && <DocSection label="结尾设置" text={docFields.hook} tone="danger" />}
          {docFields.mood && <DocSection label="情绪基调" text={docFields.mood} tone="warm" />}
          {docFields.reversalPoint && <DocSection label="反转点" text={docFields.reversalPoint} tone="purple" />}
          {(selectedChapter.targetWords || docFields.targetWordsText) && <DocSection label="目标字数" text={docFields.targetWordsText || `${selectedChapter.targetWords}字`} tone="green" />}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <WritingQualityContextBanner />
      <div style={styles.header}>
        <div style={styles.tabs}>
          <button type="button" style={{ ...styles.tab, ...(activeView === 'generate' ? styles.tabActive : null) }} onClick={() => setActiveView('generate')}>AI大纲生成</button>
          <button type="button" style={{ ...styles.tab, ...(activeView === 'browse' ? styles.tabActive : null) }} onClick={() => setActiveView('browse')}>浏览大纲 ({volumes.reduce((sum, volume) => sum + volume.chapters.length, 0)}章)</button>
        </div>
        <div style={styles.headerActions}>
          {genProgress && <span style={styles.headerMessage}>{genProgress}</span>}
          <button type="button" onClick={loadVolumes} style={styles.headerButton}>刷新</button>
        </div>
      </div>

      {activeView === 'generate' && (
        <div style={styles.generatePanel}>
          <div style={styles.formSection}>
            <label style={styles.formLabel}>目标平台</label>
            <input style={styles.input} value={platform} onChange={event => setPlatform(event.target.value)} placeholder="fanqie / zhihu / qidian" />
          </div>
          <div style={styles.formSection}>
            <label style={styles.formLabel}>题材描述</label>
            <textarea style={styles.textarea} value={material} onChange={event => setMaterial(event.target.value)} placeholder="输入已有选题、核心设定或灵感素材" rows={4} />
          </div>
          <div style={styles.formRow}>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>目标字数</label>
              <input style={styles.input} value={targetWords} onChange={event => setTargetWords(event.target.value)} placeholder="3000" />
            </div>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>风格基调</label>
              <input style={styles.input} value={tone} onChange={event => setTone(event.target.value)} placeholder="neutral / dark / light" />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>作品规模</label>
              <select style={styles.input} value={workScale} onChange={event => setWorkScale(event.target.value)}>
                <option value="ai_recommended">AI推荐</option>
                <option value="short_middle">短中长篇</option>
                <option value="middle_long">中长篇</option>
                <option value="long">长篇</option>
                <option value="ultra_long">超长篇参考</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>目标字数范围</label>
              <input style={styles.input} value={targetWordsRange} onChange={event => setTargetWordsRange(event.target.value)} placeholder="可空，例：80000-120000" />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>每章字数</label>
              <select style={styles.input} value={chapterWordsMode} onChange={event => setChapterWordsMode(event.target.value)}>
                <option value="platform_default">平台默认</option>
                <option value="custom">用户自定义</option>
                <option value="ai_recommended">AI推荐</option>
              </select>
            </div>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>卷数</label>
              <select style={styles.input} value={volumeMode} onChange={event => setVolumeMode(event.target.value)}>
                <option value="ai_recommended">AI推荐</option>
                <option value="manual">手动指定</option>
              </select>
            </div>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>每卷章节</label>
              <select style={styles.input} value={chaptersPerVolumeMode} onChange={event => setChaptersPerVolumeMode(event.target.value)}>
                <option value="dynamic">AI动态分配</option>
                <option value="manual">手动指定</option>
              </select>
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>更新计划</label>
              <select style={styles.input} value={updatePlan} onChange={event => setUpdatePlan(event.target.value)}>
                <option value="daily_words">日更字数</option>
                <option value="daily_chapters">日更章数</option>
                <option value="stockpile">存稿模式</option>
              </select>
            </div>
            <div style={{ ...styles.formSection, flex: 1 }}>
              <label style={styles.formLabel}>生成数量</label>
              <select style={styles.input} value={generateCount} onChange={event => setGenerateCount(event.target.value)}>
                <option value="1">1章</option>
                <option value="2">2章</option>
                <option value="5">5章</option>
                <option value="10">10章</option>
                <option value="remaining">本卷剩余/AI推荐</option>
              </select>
            </div>
          </div>
          {projectType === 'short' && (
            <div style={styles.impactNotice}>
              短故事三步骤：题材钩子、完整第一人称大纲、递进反转表、伏笔回收表、每章天龙8步法，并要求前300-500字强吸引。
            </div>
          )}
          <div style={styles.actionRow}>
            <button type="button" style={{ ...styles.genBtn, opacity: isGenerating ? 0.65 : 1 }} onClick={handleGenerateOutline} disabled={isGenerating}>
              {isGenerating ? '生成中...' : 'AI生成完整大纲'}
            </button>
            {saveGenerated && <button type="button" style={{ ...styles.genBtn, backgroundColor: '#2ecc71' }} onClick={handleSaveGenerated}>保存到数据库</button>}
            {canRegenerate && !isGenerating && <button type="button" style={styles.secondaryButton} onClick={handleGenerateOutline}>重新生成</button>}
          </div>
          {blockedNotice && (
            <div style={styles.blockedNoticeWrap}>
              <WorkflowBlockedNotice
                reason={blockedNotice.reason}
                missingAssets={blockedNotice.missingAssets}
                recommendedNextAction={blockedNotice.recommendedNextAction}
                onDismiss={() => setBlockedNotice(null)}
              />
            </div>
          )}
        </div>
      )}

      {activeView === 'browse' && (
        <div style={styles.browseContainer}>
          {loading ? (
            <EmptyState title="加载中..." />
          ) : volumes.length === 0 ? (
            <EmptyState title="暂无大纲" hint="请在灵感发现中创建项目，或切换到 AI 大纲生成。" action={<button type="button" onClick={() => setActiveView('generate')} style={styles.primarySmallButton}>立即生成大纲</button>} />
          ) : projectType === 'long' ? (
            <>
              <div style={styles.treePanel}>
                <div style={styles.treeTitle}>全书骨架</div>
                <div style={styles.treeContent}>
                  {volumes.map(volume => (
                    <div key={volume.id} style={styles.volumeBlock}>
                      <div style={styles.volumeHeader}>
                        <span style={styles.volumeTitle}>{volume.title}</span>
                        <span style={styles.volumeCount}>{volume.chapters.length}章</span>
                        <button type="button" onClick={() => handleAddChapter(volume.id)} title="添加章节" style={styles.addButton}>+</button>
                      </div>
                      {volume.goal && <div style={styles.volumeHint}>{volume.goal}</div>}
                      {volume.keyEvents?.length ? <div style={styles.volumeTiny}>关键事件：{volume.keyEvents.slice(0, 5).join(' -> ')}</div> : null}
                      <div style={styles.chapterList}>
                        {volume.chapters.map((chapter, index) => (
                          <ChapterListItem
                            key={chapter.id}
                            chapter={chapter}
                            index={index}
                            selected={selectedChapterId === chapter.id}
                            onSelect={() => setSelectedChapterId(chapter.id)}
                            onSplit={() => handleSplitChapter(volume.id, chapter.id)}
                            onDelete={() => handleDeleteChapter(volume.id, chapter.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={styles.detailPanel}>{selectedChapter ? renderDetail() : <EmptyState title="点击左侧章节查看详情" />}</div>
            </>
          ) : (
            <>
              <div style={styles.shortListPane}>
                <div style={styles.treeTitle}>章节列表</div>
                {volumes[0]?.goal && <div style={styles.shortMeta}>目标：{volumes[0].goal}</div>}
                <div style={styles.shortListContent}>
                  {volumes.flatMap(volume => volume.chapters).map((chapter, index) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => setSelectedChapterId(chapter.id)}
                      style={{ ...styles.shortChapterItem, ...(selectedChapterId === chapter.id ? styles.shortChapterItemActive : null) }}
                    >
                      <span style={styles.shortChapterIndex}>{index + 1}</span>
                      <span style={styles.shortChapterMain}>
                        <strong style={styles.shortChapterTitle}>{chapter.title}</strong>
                        <span style={styles.shortChapterPreview}>{chapterPreviewText(chapter).slice(0, 60)}</span>
                      </span>
                      <span style={{ ...styles.fnBadge, color: FUNCTION_COLORS[chapter.chapterFunction] || '#6c6c80', borderColor: FUNCTION_COLORS[chapter.chapterFunction] || 'rgba(255,255,255,0.08)' }}>
                        {CHAPTER_FUNCTION_LABELS[chapter.chapterFunction] || chapter.chapterFunction}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={styles.detailPanel}>{selectedChapter ? renderDetail() : <EmptyState title="点击左侧章节查看详情" />}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div style={styles.emptyState}>
    <p style={styles.emptyText}>{title}</p>
    {hint && <p style={styles.emptyHint}>{hint}</p>}
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);

const ChapterListItem: React.FC<{
  chapter: ChapterNode;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onSplit: () => void;
  onDelete: () => void;
}> = ({ chapter, index, selected, onSelect, onSplit, onDelete }) => (
  <div style={{ ...styles.chapterItem, ...(selected ? styles.chapterItemActive : null) }} onClick={onSelect}>
    <div style={styles.chapterItemRow}>
      <span style={styles.chapterIndex}>#{index + 1}</span>
      <span style={{ ...styles.chapterItemTitle, color: selected ? '#e94560' : '#c0c0d0' }}>{chapter.title}</span>
      <div style={styles.chapterActions}>
        {chapter.status === 'locked' ? (
          <span title="已锁定" style={styles.lockedBadge}>锁</span>
        ) : (
          <>
            <button type="button" onClick={event => { event.stopPropagation(); onSplit(); }} title="拆分" style={styles.iconButton}>拆</button>
            <button type="button" onClick={event => { event.stopPropagation(); onDelete(); }} title="删除" style={{ ...styles.iconButton, color: '#e74c3c', borderColor: 'rgba(231,76,60,0.24)' }}>删</button>
          </>
        )}
      </div>
    </div>
  </div>
);

const DocSection: React.FC<{ label: string; text: string; tone?: 'danger' | 'warm' | 'purple' | 'green' }> = ({ label, text, tone }) => {
  const color = tone === 'danger' ? '#e94560' : tone === 'warm' ? '#f59e0b' : tone === 'purple' ? '#a855f7' : tone === 'green' ? '#22c55e' : '#c0c0d0';
  return (
    <div style={styles.detailSection}>
      <span style={styles.detailLabel}>{label}</span>
      <div style={{ ...styles.noteBox, color, borderLeftColor: color }}>{text}</div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#16213e', overflow: 'hidden' },
  header: { padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1a1a2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  tabs: { display: 'flex', gap: 8 },
  tab: { padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#8a8aa0', cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { color: '#e94560', borderBottomColor: '#e94560' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  headerMessage: { color: '#8a8aa0', fontSize: 12, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerButton: { padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#c0c0d0', cursor: 'pointer', fontFamily: 'inherit' },
  generatePanel: { padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', maxWidth: 660 },
  blockedNoticeWrap: { marginTop: -4 },
  formSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  formLabel: { fontSize: 11, fontWeight: 600, color: '#8a8aa0' },
  formRow: { display: 'flex', gap: 12 },
  input: { width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#eaeaea', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#eaeaea', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' },
  genBtn: { padding: '10px 18px', backgroundColor: '#e94560', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  secondaryButton: { padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(243,156,18,0.3)', backgroundColor: 'rgba(243,156,18,0.12)', color: '#f59e0b', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  browseContainer: { flex: 1, display: 'flex', overflow: 'hidden' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', textAlign: 'center' },
  emptyText: { color: '#8a8aa0', fontSize: 15, margin: 0 },
  emptyHint: { color: '#6c6c80', fontSize: 12, margin: '8px 0 0' },
  treePanel: { width: 300, minWidth: 300, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  treeTitle: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#8a8aa0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  treeContent: { flex: 1, overflow: 'auto', padding: 8 },
  volumeBlock: { marginBottom: 10 },
  volumeHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 6, marginBottom: 4 },
  volumeTitle: { fontSize: 12, fontWeight: 700, color: '#eaeaea', flex: 1, minWidth: 0 },
  volumeCount: { fontSize: 11, color: '#6c6c80' },
  volumeHint: { padding: '0 10px 5px', fontSize: 10, color: '#8a8aa0', lineHeight: 1.45 },
  volumeTiny: { padding: '0 10px 6px', fontSize: 10, color: '#6c6c80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addButton: { width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(46,204,113,0.24)', backgroundColor: 'rgba(46,204,113,0.1)', color: '#2ecc71', cursor: 'pointer' },
  chapterList: { paddingLeft: 8 },
  chapterItem: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', marginBottom: 3 },
  chapterItemActive: { backgroundColor: 'rgba(233,69,96,0.1)', borderColor: 'rgba(233,69,96,0.3)' },
  chapterItemRow: { display: 'flex', alignItems: 'center', gap: 6 },
  chapterIndex: { fontSize: 11, color: '#6c6c80', width: 28, flexShrink: 0 },
  chapterItemTitle: { fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chapterActions: { display: 'flex', gap: 4, flexShrink: 0 },
  iconButton: { minWidth: 22, height: 20, fontSize: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#60a5fa', cursor: 'pointer', fontFamily: 'inherit' },
  lockedBadge: { fontSize: 10, color: '#f59e0b', padding: '1px 4px' },
  shortListPane: { width: 320, minWidth: 320, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  shortMeta: { margin: 8, padding: 10, borderRadius: 6, color: '#8a8aa0', backgroundColor: 'rgba(59,130,246,0.06)', fontSize: 11, lineHeight: 1.45 },
  shortListContent: { flex: 1, overflow: 'auto', padding: 8 },
  shortChapterItem: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 5, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(255,255,255,0.02)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  shortChapterItemActive: { backgroundColor: 'rgba(233,69,96,0.1)', borderColor: 'rgba(233,69,96,0.25)' },
  shortChapterIndex: { fontSize: 11, color: '#8a8aa0', fontWeight: 700, width: 24 },
  shortChapterMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  shortChapterTitle: { fontSize: 13, color: '#c0c0d0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  shortChapterPreview: { fontSize: 11, color: '#6c6c80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fnBadge: { padding: '2px 6px', borderRadius: 4, fontSize: 10, border: '1px solid', fontWeight: 600, whiteSpace: 'nowrap' },
  detailPanel: { flex: 1, overflow: 'auto', padding: 16 },
  detailCard: { border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.06)' },
  volumeMetaStrip: { padding: '10px 14px', backgroundColor: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.1)' },
  volumeMetaTitle: { fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 4 },
  volumeMetaLine: { fontSize: 12, color: '#93c5fd', marginBottom: 3 },
  volumeMetaHint: { fontSize: 11, color: '#8a8aa0' },
  volumeMetaClimax: { fontSize: 11, color: '#e94560', marginTop: 3 },
  detailHeader: { padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  detailTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#eaeaea' },
  detailMeta: { display: 'flex', gap: 10, fontSize: 11, color: '#8a8aa0', flexWrap: 'wrap' },
  operationBar: { padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.1)' },
  operationButton: { padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#c0c0d0', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
  impactNotice: { padding: '8px 16px', color: '#fbbf24', backgroundColor: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.12)', fontSize: 11, lineHeight: 1.5 },
  qualityPanel: { padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.025)' },
  qualityTitle: { fontSize: 12, color: '#eaeaea', fontWeight: 700, marginBottom: 8 },
  qualityList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  qualityBadge: { padding: '3px 8px', borderRadius: 5, border: '1px solid', backgroundColor: 'rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 700 },
  qualityHint: { marginTop: 8, fontSize: 11, color: '#8a8aa0', lineHeight: 1.5 },
  syncNotice: { padding: '8px 16px', color: '#93c5fd', backgroundColor: 'rgba(96,165,250,0.08)', borderBottom: '1px solid rgba(96,165,250,0.12)', fontSize: 11, lineHeight: 1.5 },
  contextPanel: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 10 },
  contextGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  contextLink: { minHeight: 76, textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.025)', color: '#c0c0d0', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' },
  contextLinkLabel: { fontSize: 10, color: '#6c6c80', fontWeight: 700 },
  contextLinkTitle: { fontSize: 12, color: '#d8d8e8', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  contextLinkHint: { fontSize: 11, color: '#8a8aa0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  contextMetaGrid: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 },
  contextMetaBox: { padding: '9px 10px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', minHeight: 66 },
  contextMetaTitle: { display: 'block', fontSize: 10, color: '#6c6c80', fontWeight: 700, marginBottom: 5 },
  contextMetaText: { margin: 0, fontSize: 12, color: '#c0c0d0', lineHeight: 1.5 },
  contextMetaHint: { margin: '5px 0 0', fontSize: 11, color: '#8a8aa0', lineHeight: 1.4 },
  contextTagWrap: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  contextTag: { padding: '3px 7px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', color: '#c0c0d0', fontSize: 11, lineHeight: 1.4 },
  contextTagEm: { marginLeft: 5, color: '#6c6c80', fontStyle: 'normal', fontSize: 10 },
  detailBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16 },
  detailSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: 11, fontWeight: 700, color: '#8a8aa0' },
  detailText: { margin: 0, fontSize: 13, color: '#c0c0d0', lineHeight: 1.7 },
  inlineButton: { padding: '3px 8px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8a8aa0', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  editTextarea: { width: '100%', padding: 10, backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 6, color: '#eaeaea', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.8, boxSizing: 'border-box', minHeight: 140 },
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primarySmallButton: { padding: '6px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  secondarySmallButton: { padding: '6px 14px', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#8a8aa0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  tagWrap: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  sceneTag: { padding: '2px 8px', borderRadius: 4, fontSize: 11, backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.15)' },
  noteBox: { fontSize: 13, backgroundColor: 'rgba(255,255,255,0.035)', padding: '8px 10px', borderRadius: 6, borderLeft: '3px solid #c0c0d0', lineHeight: 1.6 },
};

export default OutlinePage;
