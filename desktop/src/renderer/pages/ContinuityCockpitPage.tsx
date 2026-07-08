import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

const payload = <T,>(res: any): T => res?.data ?? res;
const EMPTY = '待补全';
const RISK_KEYWORDS = {
  timeline: ['timeline_conflict', 'causality_gap', 'time_order_error', 'event_sequence_risk'],
  foreshadowing: ['foreshadowing', '伏笔'],
  character: ['character', '角色'],
  world: ['world', '世界观'],
  attention: ['needs_hook', 'pacing_risk'],
};

interface Chapter {
  id: string;
  title: string;
  volumeIndex?: number;
  volume_index?: number;
  chapterIndex?: number;
  chapter_index?: number;
  wordCount?: number;
  word_count?: number;
  status?: string;
  content?: string;
  outlineId?: string;
  outline_id?: string;
}

interface ProjectInfo {
  title?: string;
  type?: string;
  targetWords?: number;
  target_words?: number;
  currentWords?: number;
  current_words?: number;
  platformStyle?: string;
  platform_style?: string;
  description?: string;
}

type TabKey = 'overview' | 'focus' | 'characters' | 'relations' | 'foreshadowing' | 'world' | 'timeline' | 'precheck' | 'postupdate';

const PHASE_TASKS = [
  { id: '7.0', title: '阶段展示与边界收口', status: '已完成' },
  { id: '7.1', title: '小说全貌总览 + 当前章节创作焦点', status: '已完成' },
  { id: '7.2', title: '人物状态与人物关系网', status: '本轮实现' },
  { id: '7.3', title: '伏笔雷达与伏笔生命周期', status: '本轮实现' },
  { id: '7.4', title: '世界观规则与时间线三线模型', status: '待开发' },
  { id: '7.5', title: '写作前检查与写作后更新闭环', status: '待开发' },
];

const STATE_TYPES = ['physical', 'emotion', 'goal', 'identity', 'relationship', 'resource', 'secret', 'ability', 'restriction', 'reputation', 'location', 'arc'];
const REVIEW_STATUSES = ['pending', 'confirmed', 'ignored', 'conflict'];
const RELATION_TYPES = ['ally', 'enemy', 'family', 'mentor', 'disciple', 'superior', 'subordinate', 'rival', 'lover_like', 'debt', 'benefit', 'hidden', 'unknown', 'other'];
const KNOWN_STATES = ['unknown', 'partial', 'known', 'misunderstood'];
const READER_STATES = ['unknown', 'hinted', 'known', 'misdirected'];
const FORESHADOWING_LEVELS = ['full_book', 'volume', 'chapter'];
const FORESHADOWING_STATUSES = ['planned', 'buried', 'deepened', 'misdirected', 'recovery_due', 'recovered', 'overdue', 'conflict', 'abandoned'];
const FORESHADOWING_RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
const FORESHADOWING_EVENT_TYPES = ['planned', 'buried', 'deepened', 'misdirected', 'hinted', 'recovered', 'delayed', 'cancelled', 'conflict', 'other'];
const FORESHADOWING_TASK_TYPES = ['bury', 'deepen', 'misdirect', 'recover', 'delay', 'check', 'avoid_contradiction'];
const TASK_TYPE_LABELS: Record<string, string> = {
  bury: '本章要埋设',
  deepen: '本章要加深',
  misdirect: '本章要误导',
  recover: '本章要回收',
  check: '本章要检查',
  avoid_contradiction: '本章避免矛盾',
  delay: '本章可延期',
};

const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const TASK_STATUSES = ['todo', 'doing', 'done', 'skipped', 'overdue', 'conflict'];

const defaultStateForm = {
  stateId: '',
  characterId: '',
  stateType: 'goal',
  currentState: '',
  evidence: '',
  cause: '',
  actionImpact: '',
  relationImpact: '',
  goalImpact: '',
  foreshadowingImpact: '',
  futureChange: '',
  conflictRisk: '',
  reviewStatus: 'pending',
  locked: false,
};

const defaultRelationshipForm = {
  relationshipId: '',
  sourceCharacterId: '',
  targetCharacterId: '',
  relationType: 'unknown',
  publicRelation: '',
  hiddenRelation: '',
  trustScore: 50,
  conflictScore: 0,
  emotionalTendency: '',
  interestBinding: '',
  currentPhase: '',
  readerKnownState: 'unknown',
  sourceKnownState: 'unknown',
  targetKnownState: 'unknown',
  changeSummary: '',
  reviewStatus: 'pending',
  locked: false,
};

const defaultForeshadowingForm = {
  threadId: '',
  title: '',
  level: 'chapter',
  volumeIndex: 1,
  status: 'planned',
  summary: '',
  readerUnderstanding: '',
  trueMeaning: '',
  revealStrategy: '',
  riskLevel: 'none',
  riskReason: '',
  plannedBuryChapterId: '',
  actualBuryChapterId: '',
  plannedDeepenChapterIds: [] as string[],
  plannedMisdirectChapterIds: [] as string[],
  recoveryWindowStartChapterId: '',
  recoveryWindowEndChapterId: '',
  actualRecoveryChapterId: '',
  relatedCharacterIds: [] as string[],
  relatedRelationshipIds: [] as string[],
  relatedTimelineEventIds: [] as string[],
  relatedWorldRuleIds: [] as string[],
  reviewStatus: 'pending',
  locked: false,
};

const defaultForeshadowingEventForm = {
  threadId: '',
  eventType: 'hinted',
  summary: '',
  evidence: '',
  impact: '',
};

const defaultForeshadowingTaskForm = {
  threadId: '',
  chapterId: '',
  taskType: 'check',
  priority: 'medium',
  instruction: '',
  reason: '',
};

const ContinuityCockpitPage: React.FC = () => {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [continuityLoading, setContinuityLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [outlines, setOutlines] = useState<any[]>([]);
  const [legacyCharacters, setLegacyCharacters] = useState<any[]>([]);
  const [foreshadowings, setForeshadowings] = useState<any[]>([]);
  const [timelines, setTimelines] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [stateItems, setStateItems] = useState<any[]>([]);
  const [qualityReports, setQualityReports] = useState<any[]>([]);
  const [continuityCharacters, setContinuityCharacters] = useState<any | null>(null);
  const [continuityRelationships, setContinuityRelationships] = useState<any | null>(null);
  const [continuityForeshadowings, setContinuityForeshadowings] = useState<any | null>(null);
  const [focusChapterId, setFocusChapterId] = useState('');
  const [manualGoal, setManualGoal] = useState('');
  const [manualForbidden, setManualForbidden] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [stateForm, setStateForm] = useState(defaultStateForm);
  const [relationshipForm, setRelationshipForm] = useState(defaultRelationshipForm);
  const [relationshipEventForm, setRelationshipEventForm] = useState({ relationshipId: '', eventType: 'other', summary: '', evidence: '', impact: '' });
  const [foreshadowingForm, setForeshadowingForm] = useState(defaultForeshadowingForm);
  const [foreshadowingEventForm, setForeshadowingEventForm] = useState(defaultForeshadowingEventForm);
  const [foreshadowingTaskForm, setForeshadowingTaskForm] = useState(defaultForeshadowingTaskForm);

  const viewKey = `phase7:continuity:${projectId}`;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [projectRes, chaptersRes, outlinesRes, charactersRes, foreshadowRes, timelinesRes, stateRes, reportsRes] = await Promise.allSettled([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/chapters`),
        api.get(`/projects/${projectId}/outlines/tree`),
        api.get(`/projects/${projectId}/characters`),
        api.get(`/projects/${projectId}/foreshadowings`),
        api.get(`/projects/${projectId}/timelines`),
        api.get(`/projects/${projectId}/state/items?status=all&limit=300`),
        api.get(`/projects/${projectId}/writing-quality/reports?limit=200`),
      ]);
      const projectData = projectRes.status === 'fulfilled' ? payload<any>(projectRes.value) : null;
      const chapterData = chaptersRes.status === 'fulfilled' ? payload<Chapter[]>(chaptersRes.value) || [] : [];
      const timelineData = timelinesRes.status === 'fulfilled' ? payload<any[]>(timelinesRes.value) || [] : [];
      setProject(projectData?.data || projectData || null);
      setChapters(Array.isArray(chapterData) ? chapterData : []);
      setOutlines(outlinesRes.status === 'fulfilled' ? payload<any[]>(outlinesRes.value) || [] : []);
      setLegacyCharacters(charactersRes.status === 'fulfilled' ? payload<any[]>(charactersRes.value) || [] : []);
      setForeshadowings(foreshadowRes.status === 'fulfilled' ? payload<any[]>(foreshadowRes.value) || [] : []);
      setTimelines(timelineData);
      setStateItems(stateRes.status === 'fulfilled' ? payload<any[]>(stateRes.value) || [] : []);
      setQualityReports(reportsRes.status === 'fulfilled' ? payload<any[]>(reportsRes.value) || [] : []);

      const eventResults = await Promise.allSettled(timelineData.slice(0, 5).map(t => api.get(`/projects/${projectId}/timelines/${t.id}/events`)));
      setTimelineEvents(eventResults.flatMap(result => result.status === 'fulfilled' ? payload<any[]>(result.value) || [] : []));
    } catch (err: any) {
      setError(err.message || '连续性驾驶舱加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadContinuity = useCallback(async () => {
    if (!projectId) return;
    setContinuityLoading(true);
    try {
      const suffix = focusChapterId ? `?focusChapterId=${encodeURIComponent(focusChapterId)}` : '';
      const [characterRes, relationshipRes, foreshadowingRes] = await Promise.allSettled([
        api.get(`/projects/${projectId}/continuity/characters${suffix}`),
        api.get(`/projects/${projectId}/continuity/relationships${suffix}`),
        api.get(`/projects/${projectId}/continuity/foreshadowings${suffix}`),
      ]);
      if (characterRes.status === 'fulfilled') setContinuityCharacters(payload<any>(characterRes.value));
      if (relationshipRes.status === 'fulfilled') setContinuityRelationships(payload<any>(relationshipRes.value));
      if (foreshadowingRes.status === 'fulfilled') setContinuityForeshadowings(payload<any>(foreshadowingRes.value));
    } catch (err: any) {
      setError(err.message || 'Phase 7.2 连续性数据加载失败');
    } finally {
      setContinuityLoading(false);
    }
  }, [projectId, focusChapterId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadContinuity(); }, [loadContinuity]);

  useEffect(() => {
    if (!chapters.length || focusChapterId) return;
    const saved = readView(viewKey).focusChapterId;
    const sorted = [...chapters].sort(chapterSort);
    const candidate = saved && chapters.some(ch => ch.id === saved)
      ? saved
      : [...sorted].reverse().find(ch => ch.status !== 'locked')?.id || sorted[0]?.id || '';
    setFocusChapterId(candidate);
  }, [chapters, focusChapterId, viewKey]);

  useEffect(() => {
    const saved = readView(viewKey);
    setManualGoal(saved.manualGoal || '');
    setManualForbidden(saved.manualForbidden || '');
    setManualNotes(saved.manualNotes || '');
    setManualPrompt(saved.manualPrompt || '');
  }, [viewKey]);

  useEffect(() => {
    if (!projectId || !focusChapterId) return;
    writeView(viewKey, { focusChapterId, manualGoal, manualForbidden, manualNotes, manualPrompt });
  }, [focusChapterId, manualGoal, manualForbidden, manualNotes, manualPrompt, projectId, viewKey]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const sortedChapters = useMemo(() => [...chapters].sort(chapterSort), [chapters]);
  const focusChapter = useMemo(() => chapters.find(ch => ch.id === focusChapterId) || sortedChapters[0] || null, [chapters, focusChapterId, sortedChapters]);
  const focusIndex = useMemo(() => focusChapter ? sortedChapters.findIndex(ch => ch.id === focusChapter.id) : -1, [focusChapter, sortedChapters]);
  const outlineFlat = useMemo(() => flattenOutlines(outlines), [outlines]);
  const focusOutline = useMemo(() => findFocusOutline(focusChapter, outlineFlat), [focusChapter, outlineFlat]);
  const recentChapters = useMemo(() => sortedChapters.slice(Math.max(0, focusIndex - 4), Math.max(0, focusIndex) + 1), [focusIndex, sortedChapters]);
  const relatedForeshadowings = useMemo(() => findRelatedForeshadowings(foreshadowings, focusChapter, focusIndex + 1), [foreshadowings, focusChapter, focusIndex]);
  const relatedTimelineEvents = useMemo(() => findRelatedTimelineEvents(timelineEvents, focusChapter), [timelineEvents, focusChapter]);
  const focusCharacterItems = continuityCharacters?.groups?.focusCharacters || [];
  const focusRelationshipItems = continuityRelationships?.groups?.focusRelationships || [];
  const focusForeshadowingTasks = continuityForeshadowings?.groups?.focusTasks || [];
  const relatedCharacters = focusCharacterItems.length ? focusCharacterItems : findRelatedCharacters(legacyCharacters, focusChapter, focusOutline);
  const pendingItems = useMemo(() => stateItems.filter(item => ['pending', 'draft', 'needs_review'].includes(item.status)), [stateItems]);
  const reportSearchTexts = useMemo(() => qualityReports.map(report => searchableFields([report.payload, report.summary, report.title, report.issueSummary, report.issue_summary])), [qualityReports]);
  const stateItemSearchTexts = useMemo(() => stateItems.map(item => searchableFields([item.payload, item.summary, item.title, item.targetType, item.target_type])), [stateItems]);
  const timelineRisks = qualityReports.reduce((sum, report) => sum + Number(report.timelineRiskCount || 0), 0)
    + countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.timeline)
    + countKeywordMatches(stateItemSearchTexts, RISK_KEYWORDS.timeline);
  const foreshadowingRisks = foreshadowings.filter(f => {
    const status = f.status || '';
    return status === 'pending' || status === 'buried' && Number(f.plannedRecoveryChapterIndex ?? f.planned_recovery_chapter_index ?? 9999) <= (focusIndex + 2);
  }).length + countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.foreshadowing);

  const stats = {
    totalChapters: chapters.length,
    writtenChapters: chapters.filter(ch => (ch.wordCount ?? ch.word_count ?? 0) > 0 || ch.status === 'completed' || ch.status === 'locked').length,
    writtenWords: chapters.reduce((sum, ch) => sum + Number(ch.wordCount ?? ch.word_count ?? 0), 0),
    targetWords: Number(project?.targetWords ?? project?.target_words ?? 0),
    pendingConfirmations: pendingItems.length
      + Number(continuityCharacters?.summary?.pendingStateCount || 0)
      + Number(continuityRelationships?.summary?.pendingReviewCount || 0)
      + Number(continuityForeshadowings?.summary?.pendingReviewCount || 0),
    foreshadowingRisks: Number(continuityForeshadowings?.summary?.recoveryDueCount || 0)
      + Number(continuityForeshadowings?.summary?.overdueCount || 0)
      + Number(continuityForeshadowings?.summary?.highRiskCount || 0)
      + foreshadowingRisks,
    timelineRisks,
    characterStateRisks: Number(continuityCharacters?.summary?.conflictStateCount || 0)
      + stateItems.filter(item => item.targetType === 'character' || item.target_type === 'character').length
      + countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.character),
    worldRuleRisks: countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.world) + countKeywordMatches(stateItemSearchTexts, RISK_KEYWORDS.world),
    attentionRisks: countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.attention),
    focusCharacters: Number(continuityCharacters?.summary?.focusCharacters || 0),
    focusRelationships: Number(continuityRelationships?.summary?.focusRelationships || 0),
    highConflictRelationships: Number(continuityRelationships?.summary?.highConflictRelationships || 0),
    hiddenRelationships: Number(continuityRelationships?.summary?.hiddenRelationships || 0),
    focusForeshadowingTasks: Number(continuityForeshadowings?.summary?.focusTasks || 0),
    recoveryDueForeshadowings: Number(continuityForeshadowings?.summary?.recoveryDueCount || 0),
    overdueForeshadowings: Number(continuityForeshadowings?.summary?.overdueCount || 0),
    highRiskForeshadowings: Number(continuityForeshadowings?.summary?.highRiskCount || 0),
  };

  const generatedPrompt = useMemo(() => buildPreWritingPrompt({
    project,
    focusChapter,
    focusOutline,
    relatedCharacters,
    relatedRelationships: focusRelationshipItems,
    relatedForeshadowings,
    focusForeshadowingTasks,
    relatedTimelineEvents,
    manualGoal,
    manualForbidden,
    manualNotes,
  }), [project, focusChapter, focusOutline, relatedCharacters, focusRelationshipItems, relatedForeshadowings, focusForeshadowingTasks, relatedTimelineEvents, manualGoal, manualForbidden, manualNotes]);

  const visiblePrompt = focusChapter ? manualPrompt || generatedPrompt : '待创建章节后生成。';

  const handleCopyPrompt = useCallback(async () => {
    try {
      await copyText(visiblePrompt);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }, [visiblePrompt]);

  const saveStateSnapshot = async () => {
    if (!stateForm.characterId) return setNotice('请先选择人物。');
    const isEditing = Boolean(stateForm.stateId);
    const body = {
      characterId: stateForm.characterId,
      chapterId: focusChapter?.id,
      volumeIndex: focusChapter ? volumeIndex(focusChapter) : undefined,
      stateType: stateForm.stateType,
      currentState: stateForm.currentState,
      evidence: stateForm.evidence,
      cause: stateForm.cause,
      actionImpact: stateForm.actionImpact,
      relationImpact: stateForm.relationImpact,
      goalImpact: stateForm.goalImpact,
      foreshadowingImpact: stateForm.foreshadowingImpact,
      futureChange: stateForm.futureChange,
      conflictRisk: stateForm.conflictRisk,
      source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/character-states/${stateForm.stateId}`, {
      ...body,
      reviewStatus: stateForm.reviewStatus,
      locked: stateForm.reviewStatus === 'confirmed' && stateForm.locked,
      forceUnlock: !stateForm.locked,
    });
    else await api.post(`/projects/${projectId}/continuity/character-states`, body);
    setNotice(isEditing ? '人物状态修改已保存。' : '人物状态已保存为待确认记录，需要确认后才能锁定。');
    setStateForm(defaultStateForm);
    await loadContinuity();
  };

  const patchStateSnapshot = async (state: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/character-states/${state.id}`, patch);
    await loadContinuity();
  };

  const saveRelationship = async () => {
    if (!relationshipForm.sourceCharacterId || !relationshipForm.targetCharacterId) return setNotice('请先选择关系双方。');
    const isEditing = Boolean(relationshipForm.relationshipId);
    const body = {
      ...relationshipForm,
      firstChapterId: focusChapter?.id,
      latestChapterId: focusChapter?.id,
      source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/relationships/${relationshipForm.relationshipId}`, {
      ...body,
      locked: relationshipForm.reviewStatus === 'confirmed' && relationshipForm.locked,
    });
    else {
      const { relationshipId, reviewStatus, locked, ...createBody } = body;
      void relationshipId;
      void reviewStatus;
      void locked;
      await api.post(`/projects/${projectId}/continuity/relationships`, createBody);
    }
    setNotice(isEditing ? '人物关系修改已保存。' : '人物关系已保存为待确认记录，需要确认后才能锁定。');
    setRelationshipForm(defaultRelationshipForm);
    await loadContinuity();
  };

  const patchRelationship = async (relationship: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/relationships/${relationship.id}`, patch);
    await loadContinuity();
  };

  const saveRelationshipEvent = async () => {
    if (!relationshipEventForm.relationshipId) return setNotice('请先选择关系。');
    await api.post(`/projects/${projectId}/continuity/relationships/${relationshipEventForm.relationshipId}/events`, {
      chapterId: focusChapter?.id,
      eventType: relationshipEventForm.eventType,
      summary: relationshipEventForm.summary,
      evidence: relationshipEventForm.evidence,
      impact: relationshipEventForm.impact,
      reviewStatus: 'pending',
    });
    setNotice('关系变化事件已保存为待确认记录。');
    setRelationshipEventForm({ relationshipId: '', eventType: 'other', summary: '', evidence: '', impact: '' });
    await loadContinuity();
  };

  const saveForeshadowingThread = async () => {
    if (!foreshadowingForm.title.trim()) return setNotice('Please enter foreshadowing title.');
    const isEditing = Boolean(foreshadowingForm.threadId);
    const body = {
      title: foreshadowingForm.title,
      level: foreshadowingForm.level,
      volumeIndex: Number(foreshadowingForm.volumeIndex || 1),
      status: foreshadowingForm.status,
      summary: foreshadowingForm.summary,
      readerUnderstanding: foreshadowingForm.readerUnderstanding,
      trueMeaning: foreshadowingForm.trueMeaning,
      revealStrategy: foreshadowingForm.revealStrategy,
      riskLevel: foreshadowingForm.riskLevel,
      riskReason: foreshadowingForm.riskReason,
      plannedBuryChapterId: foreshadowingForm.plannedBuryChapterId || undefined,
      actualBuryChapterId: foreshadowingForm.actualBuryChapterId || undefined,
      plannedDeepenChapterIds: foreshadowingForm.plannedDeepenChapterIds,
      plannedMisdirectChapterIds: foreshadowingForm.plannedMisdirectChapterIds,
      recoveryWindowStartChapterId: foreshadowingForm.recoveryWindowStartChapterId || undefined,
      recoveryWindowEndChapterId: foreshadowingForm.recoveryWindowEndChapterId || undefined,
      actualRecoveryChapterId: foreshadowingForm.actualRecoveryChapterId || undefined,
      relatedCharacterIds: foreshadowingForm.relatedCharacterIds,
      relatedRelationshipIds: foreshadowingForm.relatedRelationshipIds,
      relatedTimelineEventIds: foreshadowingForm.relatedTimelineEventIds,
      relatedWorldRuleIds: foreshadowingForm.relatedWorldRuleIds,
      source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/foreshadowings/${foreshadowingForm.threadId}`, {
      ...body,
      reviewStatus: foreshadowingForm.reviewStatus,
      locked: foreshadowingForm.reviewStatus === 'confirmed' && foreshadowingForm.locked,
      forceUnlock: !foreshadowingForm.locked,
    });
    else await api.post(`/projects/${projectId}/continuity/foreshadowings`, body);
    setNotice(isEditing ? 'Foreshadowing thread saved.' : 'Foreshadowing thread created as pending review.');
    setForeshadowingForm(defaultForeshadowingForm);
    await loadContinuity();
  };

  const patchForeshadowingThread = async (thread: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/foreshadowings/${thread.id}`, patch);
    await loadContinuity();
  };

  const saveForeshadowingEvent = async () => {
    if (!foreshadowingEventForm.threadId) return setNotice('Please choose a foreshadowing thread.');
    await api.post(`/projects/${projectId}/continuity/foreshadowings/${foreshadowingEventForm.threadId}/events`, {
      chapterId: focusChapter?.id,
      eventType: foreshadowingEventForm.eventType,
      summary: foreshadowingEventForm.summary,
      evidence: foreshadowingEventForm.evidence,
      impact: foreshadowingEventForm.impact,
      source: 'manual',
    });
    setNotice('Foreshadowing lifecycle event created as pending review.');
    setForeshadowingEventForm(defaultForeshadowingEventForm);
    await loadContinuity();
  };

  const saveForeshadowingTask = async () => {
    if (!foreshadowingTaskForm.threadId || !foreshadowingTaskForm.chapterId) return setNotice('Please choose thread and chapter for task.');
    await api.post(`/projects/${projectId}/continuity/foreshadowing-tasks`, {
      threadId: foreshadowingTaskForm.threadId,
      chapterId: foreshadowingTaskForm.chapterId,
      taskType: foreshadowingTaskForm.taskType,
      priority: foreshadowingTaskForm.priority,
      instruction: foreshadowingTaskForm.instruction,
      reason: foreshadowingTaskForm.reason,
      source: 'manual',
    });
    setNotice('Foreshadowing chapter task created as pending review.');
    setForeshadowingTaskForm(defaultForeshadowingTaskForm);
    await loadContinuity();
  };

  const patchForeshadowingTask = async (task: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/foreshadowing-tasks/${task.id}`, patch);
    await loadContinuity();
  };

  if (loading) return <div style={styles.loading}>加载小说连续性驾驶舱...</div>;
  if (!projectId) return <div style={styles.loading}>请先选择项目。</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>Phase 7：小说连续性驾驶舱</div>
          <h1 style={styles.title}>小说连续性驾驶舱</h1>
          <p style={styles.subtitle}>围绕当前创作章节查看全貌、人物状态、关系风险、伏笔雷达与写作前注意事项。7.4-7.5 只展示入口，不假装完成。</p>
        </div>
        <button type="button" style={styles.secondaryButton} onClick={() => navigate(`/project/${projectId}/dashboard`)}>返回首页</button>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}
      {continuityLoading && <div style={styles.notice}>正在刷新 Phase 7 连续性数据...</div>}

      <section style={styles.focusBar}>
        <label style={styles.label}>当前创作章节</label>
        <select value={focusChapterId} onChange={event => setFocusChapterId(event.target.value)} style={styles.select} disabled={!sortedChapters.length}>
          {!sortedChapters.length && <option value="">暂无章节</option>}
          {sortedChapters.map(ch => (
            <option key={ch.id} value={ch.id}>第{volumeIndex(ch)}卷 第{chapterIndex(ch)}章 {ch.title} [{ch.status || 'draft'}]</option>
          ))}
        </select>
        <span style={styles.savedHint}>{sortedChapters.length ? '已保存到本地视图状态，刷新后恢复。' : '当前项目暂无章节，请先创建大纲或章节。'}</span>
      </section>

      <section style={styles.phasePanel}>
        <div style={styles.panelTitle}>Phase 7 分期边界</div>
        <div style={styles.phaseGrid}>
          {PHASE_TASKS.map(task => (
            <div key={task.id} style={{ ...styles.phaseItem, borderColor: task.status === '本轮实现' ? 'rgba(34,197,94,.35)' : 'rgba(148,163,184,.22)' }}>
              <strong>{task.id}</strong>
              <span>{task.title}</span>
              <em>{task.status}</em>
            </div>
          ))}
        </div>
      </section>

      <nav style={styles.tabs}>
        {[
          ['overview', '总览'], ['focus', '当前章焦点'], ['characters', '人物'], ['relations', '关系网'],
          ['foreshadowing', '伏笔'], ['world', '世界观'], ['timeline', '时间线'], ['precheck', '写作前检查'], ['postupdate', '写作后更新'],
        ].map(([key, label]) => (
          <button key={key} type="button" style={activeTab === key ? styles.tabActive : styles.tab} onClick={() => setActiveTab(key as TabKey)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && renderOverview({ stats, focusChapter, recentChapters, stateItems: pendingItems, relatedForeshadowings, relatedTimelineEvents })}
      {activeTab === 'focus' && renderFocus({
        focusChapter, focusOutline, relatedCharacters, relatedRelationships: focusRelationshipItems, relatedForeshadowings,
        relatedForeshadowingTasks: focusForeshadowingTasks, relatedTimelineEvents, manualGoal, setManualGoal, manualForbidden, setManualForbidden, manualNotes, setManualNotes,
        manualPrompt, setManualPrompt, visiblePrompt, promptDisabled: !focusChapter, copyStatus, onCopyPrompt: handleCopyPrompt,
      })}
      {activeTab === 'characters' && renderCharactersTab({
        data: continuityCharacters, legacyCharacters, stateForm, setStateForm, saveStateSnapshot, patchStateSnapshot, setNotice,
      })}
      {activeTab === 'relations' && renderRelationsTab({
        data: continuityRelationships, characters: continuityCharacters?.groups?.allCharacters || [], relationshipForm, setRelationshipForm,
        relationshipEventForm, setRelationshipEventForm, saveRelationship, saveRelationshipEvent, patchRelationship, setNotice,
      })}
      {activeTab === 'foreshadowing' && renderForeshadowingTab({
        data: continuityForeshadowings,
        chapters: sortedChapters,
        characters: continuityCharacters?.groups?.allCharacters || [],
        relationships: continuityRelationships?.groups?.allRelationships || [],
        form: foreshadowingForm,
        setForm: setForeshadowingForm,
        eventForm: foreshadowingEventForm,
        setEventForm: setForeshadowingEventForm,
        taskForm: foreshadowingTaskForm,
        setTaskForm: setForeshadowingTaskForm,
        saveThread: saveForeshadowingThread,
        patchThread: patchForeshadowingThread,
        saveEvent: saveForeshadowingEvent,
        saveTask: saveForeshadowingTask,
        patchTask: patchForeshadowingTask,
        setNotice,
      })}
      {!['overview', 'focus', 'characters', 'relations', 'foreshadowing'].includes(activeTab) && renderFutureTab(activeTab)}
    </div>
  );
};

function renderOverview(input: any) {
  const cards = [
    ['当前卷/当前章', input.focusChapter ? `第${volumeIndex(input.focusChapter)}卷 / 第${chapterIndex(input.focusChapter)}章` : EMPTY],
    ['已写章节/总章节', `${input.stats.writtenChapters}/${input.stats.totalChapters}`],
    ['已写字数/目标字数', `${input.stats.writtenWords}/${input.stats.targetWords || '待接入'}`],
    ['待确认设定', String(input.stats.pendingConfirmations)],
    ['当前章人物', String(input.stats.focusCharacters)],
    ['当前章关系', String(input.stats.focusRelationships)],
    ['人物状态风险', String(input.stats.characterStateRisks)],
    ['高冲突关系', String(input.stats.highConflictRelationships)],
    ['隐藏关系', String(input.stats.hiddenRelationships)],
    ['伏笔风险', String(input.stats.foreshadowingRisks)],
    ['本章伏笔任务', String(input.stats.focusForeshadowingTasks)],
    ['临近回收', String(input.stats.recoveryDueForeshadowings)],
    ['逾期伏笔', String(input.stats.overdueForeshadowings)],
    ['高风险伏笔', String(input.stats.highRiskForeshadowings)],
    ['时间线风险', String(input.stats.timelineRisks)],
    ['注意力风险', String(input.stats.attentionRisks)],
  ];
  return (
    <div>
      <div style={styles.notice}>当前风险统计为轻量统计：Phase 7.2 人物状态与关系统计来自连续性 API；伏笔、时间线和质量风险仍使用已加载摘要数据。</div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={label} value={value} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前创作全貌">
          <Line label="当前主线阶段" value={input.focusChapter ? '围绕当前章节继续推进，主线阶段待由大纲补全。' : EMPTY} />
          <Line label="当前章节标题" value={input.focusChapter?.title || '待选择章节'} />
          <Line label="最近章节" value={input.recentChapters.length ? input.recentChapters.map((ch: any) => ch.title).join(' / ') : EMPTY} />
          <Line label="待作者确认项" value={input.stats.pendingConfirmations ? `${input.stats.pendingConfirmations} 项待确认` : EMPTY} />
        </Panel>
        <Panel title="下一个创作动作">
          <Line label="人物状态" value={input.stats.focusCharacters ? `当前章 ${input.stats.focusCharacters} 个相关人物，先核对状态再写正文。` : '暂无本章人物数据。'} />
          <Line label="人物关系" value={input.stats.focusRelationships ? `当前章 ${input.stats.focusRelationships} 条相关关系。` : '暂无本章关系数据。'} />
          <Line label="伏笔提醒" value={input.relatedForeshadowings.length ? input.relatedForeshadowings.slice(0, 4).map((f: any) => f.content || f.title).join(' / ') : EMPTY} />
          <Line label="建议" value="先确认当前章节目标、人物状态、关系边界，再进入正文生成或手写。" />
        </Panel>
      </section>
    </div>
  );
}

function renderFocus(input: any) {
  const ch = input.focusChapter as Chapter | null;
  const goal = input.manualGoal || extractGoal(input.focusOutline);
  const characterNotes = input.relatedCharacters.length
    ? input.relatedCharacters.map((c: any) => `${c.name}：${c.currentStateSummary || c.identity || EMPTY}`).join('；')
    : '暂无本章角色状态快照，Phase 7.2 可通过人物 Tab 手动补全。';
  const relationshipNotes = input.relatedRelationships.length
    ? input.relatedRelationships.map((r: any) => `${r.sourceCharacterName} - ${r.targetCharacterName}：${r.publicRelation || EMPTY}，冲突 ${r.conflictScore}`).join('；')
    : '暂无本章关系数据，Phase 7.2 可通过关系网 Tab 手动补全。';
  const foreshadowingNotes = input.relatedForeshadowingTasks?.length
    ? groupTaskNotes(input.relatedForeshadowingTasks)
    : ch && input.relatedForeshadowings.length
      ? input.relatedForeshadowings.map((f: any) => f.content || f.title).join(' / ')
      : '暂无本章伏笔任务，Phase 7.3 可通过伏笔 Tab 手动补全。';
  const forbiddenBase = [
    ch?.status === 'locked' ? 'locked 章节不可自动修改。' : '',
    '已确认设定不可被当前页面直接覆盖。',
    'AI 生成内容必须进入待确认，不直接写入正式设定库。',
    !goal ? '当前章节目标待从大纲补全。' : '',
  ].filter(Boolean);
  return (
    <div>
      <section style={styles.twoColumns}>
        <Panel title="顶部全貌摘要区">
          <Line label="当前章节" value={ch?.title || '待创建'} />
          <Line label="卷序号/章序号" value={ch ? `${volumeIndex(ch)} / ${chapterIndex(ch)}` : EMPTY} />
          <Line label="状态/字数" value={ch ? `${ch.status || 'draft'} / ${wordCount(ch)}字 / ${ch.status === 'locked' ? 'locked' : '可编辑'}` : EMPTY} />
        </Panel>
        <Panel title="当前章节创作辅助区">
          <Line label="本章目标" value={ch ? goal || EMPTY : EMPTY} />
          <Line label="出场人物" value={ch ? input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => c.name).join(' / ') : '暂无本章人物数据。' : '待创建章节后识别'} />
          <Line label="本章备注" value={input.manualNotes || '暂无人工备注。'} />
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="结构化详情区">
          <Line label="人物状态注意事项" value={characterNotes} />
          <Line label="关系注意事项" value={relationshipNotes} />
          <Line label="伏笔注意事项" value={foreshadowingNotes} />
          <Line label="世界观注意事项" value="暂无本章世界观规则，Phase 7.4 将接入世界观规则系统。" />
          <Line label="时间线注意事项" value={ch && input.relatedTimelineEvents.length ? input.relatedTimelineEvents.map((e: any) => e.title).join('；') : '暂无本章时间线事件，Phase 7.4 将接入时间线三线模型。'} />
          <Line label="禁止写错事项" value={[...forbiddenBase, input.manualForbidden].filter(Boolean).join('；')} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>当前章写作目标</label>
          <textarea value={input.manualGoal} onChange={(e) => input.setManualGoal(e.target.value)} style={styles.textarea} placeholder="人工补充，仅保存到本地视图状态。" />
          <label style={styles.label}>禁止写错事项</label>
          <textarea value={input.manualForbidden} onChange={(e) => input.setManualForbidden(e.target.value)} style={styles.textarea} placeholder="每行一条。不会覆盖正式设定库。" />
          <label style={styles.label}>本章备注</label>
          <textarea value={input.manualNotes} onChange={(e) => input.setManualNotes(e.target.value)} style={styles.textarea} />
          <div style={styles.notice}>人工修改内容尚未写入正式设定库；已确认设定不会被此页面直接覆盖。</div>
        </Panel>
      </section>
      <Panel title="本章写作前提示词">
        <textarea value={input.visiblePrompt} onChange={(e) => input.setManualPrompt(e.target.value)} style={{ ...styles.textarea, minHeight: 240 }} disabled={input.promptDisabled} />
        <button type="button" style={styles.copyButton} onClick={input.onCopyPrompt}>
          {input.copyStatus === 'copied' ? '已复制' : input.copyStatus === 'failed' ? '复制失败，请手动复制' : '复制提示词'}
        </button>
        <div style={styles.notice}>可复制文本用于写作前检查。人物状态与关系只使用真实连续性数据，缺失信息显示“待补全”。</div>
      </Panel>
    </div>
  );
}

function renderCharactersTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = data.groups || {};
  const allCharacters = groups.allCharacters || input.legacyCharacters || [];
  const isEditing = Boolean(input.stateForm.stateId);
  const canLock = isEditing && input.stateForm.reviewStatus === 'confirmed';
  const cards = [
    ['总人物数', summary.totalCharacters ?? allCharacters.length ?? 0],
    ['当前章相关人物', summary.focusCharacters ?? 0],
    ['待确认状态', summary.pendingStateCount ?? 0],
    ['状态冲突风险', summary.conflictStateCount ?? 0],
    ['最近变化人物', summary.recentChangedCount ?? 0],
    ['locked 状态', summary.lockedStateCount ?? 0],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章节创作辅助区">
          {(groups.focusCharacters || []).length ? groups.focusCharacters.map((c: any) => <CharacterCard key={c.id} character={c} input={input} />) : (
            <p style={styles.empty}>暂无本章人物数据。可以通过正文、大纲或手动选择人物补全。</p>
          )}
        </Panel>
        <Panel title="本章缺失的人物状态信息">
          <Line label="目标" value={(groups.focusCharacters || []).some((c: any) => c.currentGoal !== EMPTY) ? '已有部分人物目标。' : '待补全'} />
          <Line label="状态摘要" value={(groups.focusCharacters || []).some((c: any) => c.currentStateSummary !== EMPTY) ? '已有部分人物状态。' : '待补全'} />
          <Line label="说话方式" value={(groups.focusCharacters || []).some((c: any) => c.dialogueStyle !== EMPTY) ? '已有部分说话方式。' : '待补全'} />
          <div style={styles.notice}>AI 生成或人工微调内容进入待确认，不直接覆盖已确认设定。</div>
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="结构化详情区">
          <Group title="本章人物" items={groups.focusCharacters || []} render={(c: any) => <CharacterCard character={c} input={input} />} />
          <Group title="主线人物" items={groups.mainCharacters || []} render={(c: any) => <CharacterCard character={c} input={input} />} />
          <Group title="最近变化人物" items={groups.recentlyChanged || []} render={(c: any) => <CharacterCard character={c} input={input} />} />
          <Group title="待确认人物" items={groups.pendingReview || []} render={(c: any) => <CharacterCard character={c} input={input} />} />
          <Group title="风险人物" items={groups.conflictRisk || []} render={(c: any) => <CharacterCard character={c} input={input} />} />
          <Group title="全部人物" items={allCharacters} render={(c: any) => <CharacterCard character={c} input={input} />} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>人物</label>
          <select style={styles.selectFull} value={input.stateForm.characterId} onChange={(e) => input.setStateForm({ ...input.stateForm, characterId: e.target.value })}>
            <option value="">选择人物</option>
            {allCharacters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={styles.label}>状态类型</label>
          <select style={styles.selectFull} value={input.stateForm.stateType} onChange={(e) => input.setStateForm({ ...input.stateForm, stateType: e.target.value })}>
            {STATE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <FormTextarea label="当前状态" value={input.stateForm.currentState} onChange={(value) => input.setStateForm({ ...input.stateForm, currentState: value })} />
          <FormTextarea label="证据片段" value={input.stateForm.evidence} onChange={(value) => input.setStateForm({ ...input.stateForm, evidence: value })} />
          <FormTextarea label="形成原因" value={input.stateForm.cause} onChange={(value) => input.setStateForm({ ...input.stateForm, cause: value })} />
          <FormTextarea label="对行动的影响" value={input.stateForm.actionImpact} onChange={(value) => input.setStateForm({ ...input.stateForm, actionImpact: value })} />
          <FormTextarea label="对关系的影响" value={input.stateForm.relationImpact} onChange={(value) => input.setStateForm({ ...input.stateForm, relationImpact: value })} />
          <FormTextarea label="对目标的影响" value={input.stateForm.goalImpact} onChange={(value) => input.setStateForm({ ...input.stateForm, goalImpact: value })} />
          <FormTextarea label="对伏笔的影响" value={input.stateForm.foreshadowingImpact} onChange={(value) => input.setStateForm({ ...input.stateForm, foreshadowingImpact: value })} />
          <FormTextarea label="后续变化可能" value={input.stateForm.futureChange} onChange={(value) => input.setStateForm({ ...input.stateForm, futureChange: value })} />
          <FormTextarea label="冲突风险" value={input.stateForm.conflictRisk} onChange={(value) => input.setStateForm({ ...input.stateForm, conflictRisk: value })} />
          <label style={styles.label}>处理状态</label>
          {isEditing ? (
            <select style={styles.selectFull} value={input.stateForm.reviewStatus} onChange={(e) => input.setStateForm({ ...input.stateForm, reviewStatus: e.target.value, locked: e.target.value === 'confirmed' ? input.stateForm.locked : false })}>
              {REVIEW_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          ) : (
            <div style={styles.readonlyBox}>新增模式固定为 pending。</div>
          )}
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={isEditing && input.stateForm.locked}
              disabled={!canLock}
              onChange={(e) => input.setStateForm({ ...input.stateForm, locked: e.target.checked })}
            /> 锁定状态
          </label>
          {!canLock && <div style={styles.hint}>{isEditing ? '先确认后才能锁定。' : '新增模式固定 unlocked，确认后才能锁定。'}</div>}
          <button type="button" style={styles.primaryButton} onClick={input.saveStateSnapshot}>{input.stateForm.stateId ? '保存状态修改' : '新增人物状态快照'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setStateForm(defaultStateForm)}>清空表单</button>
          <div style={styles.notice}>人工微调内容写入 Phase 7.2 待确认记录，不直接覆盖已确认设定；locked 状态不能被静默覆盖。</div>
        </Panel>
      </section>
    </div>
  );
}

function renderRelationsTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = data.groups || {};
  const allRelationships = groups.allRelationships || [];
  const isEditing = Boolean(input.relationshipForm.relationshipId);
  const canLock = isEditing && input.relationshipForm.reviewStatus === 'confirmed';
  const cards = [
    ['总关系数', summary.totalRelationships ?? 0],
    ['当前章相关关系', summary.focusRelationships ?? 0],
    ['隐藏关系', summary.hiddenRelationships ?? 0],
    ['高冲突关系', summary.highConflictRelationships ?? 0],
    ['待确认关系', summary.pendingReviewCount ?? 0],
    ['最近变化关系', summary.changedRecentlyCount ?? 0],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章节创作辅助区">
          {(groups.focusRelationships || []).length ? groups.focusRelationships.map((rel: any) => <RelationshipCard key={rel.id} relationship={rel} input={input} />) : (
            <p style={styles.empty}>暂无本章关系数据。Phase 7.2 可通过手动新增关系或后续写作后更新补全。</p>
          )}
        </Panel>
        <Panel title="当前章关系注意">
          <Line label="最紧张关系" value={(groups.focusRelationships || []).sort((a: any, b: any) => b.conflictScore - a.conflictScore)[0]?.changeSummary || '待补全'} />
          <Line label="隐藏关系" value={(groups.hiddenRelationships || []).length ? `${groups.hiddenRelationships.length} 条隐藏关系` : '待补全'} />
          <Line label="读者已知" value={(groups.focusRelationships || []).some((r: any) => r.readerKnownState === 'known' && r.sourceKnownState !== 'known') ? '存在读者已知但角色未知的关系。' : '待补全'} />
          <Line label="禁止写错" value="公开关系、隐藏关系、读者已知状态、双方已知状态需要保持一致。" />
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="结构化详情区">
          <Group title="本章相关关系" items={groups.focusRelationships || []} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
          <Group title="高冲突关系" items={groups.highConflict || []} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
          <Group title="隐藏关系" items={groups.hiddenRelationships || []} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
          <Group title="信任度下降关系" items={groups.trustChanged || []} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
          <Group title="待确认关系" items={groups.pendingReview || []} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
          <Group title="全部关系" items={allRelationships} render={(r: any) => <RelationshipCard relationship={r} input={input} />} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>人物 A</label>
          <select style={styles.selectFull} value={input.relationshipForm.sourceCharacterId} onChange={(e) => input.setRelationshipForm({ ...input.relationshipForm, sourceCharacterId: e.target.value })}>
            <option value="">选择人物 A</option>
            {input.characters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={styles.label}>人物 B</label>
          <select style={styles.selectFull} value={input.relationshipForm.targetCharacterId} onChange={(e) => input.setRelationshipForm({ ...input.relationshipForm, targetCharacterId: e.target.value })}>
            <option value="">选择人物 B</option>
            {input.characters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={styles.label}>关系类型</label>
          <select style={styles.selectFull} value={input.relationshipForm.relationType} onChange={(e) => input.setRelationshipForm({ ...input.relationshipForm, relationType: e.target.value })}>
            {RELATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <FormTextarea label="公开关系" value={input.relationshipForm.publicRelation} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, publicRelation: value })} />
          <FormTextarea label="隐藏关系" value={input.relationshipForm.hiddenRelation} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, hiddenRelation: value })} />
          <NumberInput label="信任度" value={input.relationshipForm.trustScore} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, trustScore: value })} />
          <NumberInput label="冲突度" value={input.relationshipForm.conflictScore} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, conflictScore: value })} />
          <FormTextarea label="利益绑定" value={input.relationshipForm.interestBinding} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, interestBinding: value })} />
          <FormTextarea label="变化摘要" value={input.relationshipForm.changeSummary} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, changeSummary: value })} />
          <KnownSelect label="读者已知状态" options={READER_STATES} value={input.relationshipForm.readerKnownState} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, readerKnownState: value })} />
          <KnownSelect label="A 已知状态" options={KNOWN_STATES} value={input.relationshipForm.sourceKnownState} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, sourceKnownState: value })} />
          <KnownSelect label="B 已知状态" options={KNOWN_STATES} value={input.relationshipForm.targetKnownState} onChange={(value) => input.setRelationshipForm({ ...input.relationshipForm, targetKnownState: value })} />
          <label style={styles.label}>处理状态</label>
          {isEditing ? (
            <select style={styles.selectFull} value={input.relationshipForm.reviewStatus} onChange={(e) => input.setRelationshipForm({ ...input.relationshipForm, reviewStatus: e.target.value, locked: e.target.value === 'confirmed' ? input.relationshipForm.locked : false })}>
              {REVIEW_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          ) : (
            <div style={styles.readonlyBox}>新增模式固定为 pending。</div>
          )}
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={isEditing && input.relationshipForm.locked}
              disabled={!canLock}
              onChange={(e) => input.setRelationshipForm({ ...input.relationshipForm, locked: e.target.checked })}
            /> 锁定关系
          </label>
          {!canLock && <div style={styles.hint}>{isEditing ? '先确认后才能锁定。' : '新增模式固定 unlocked，确认后才能锁定。'}</div>}
          <button type="button" style={styles.primaryButton} onClick={input.saveRelationship}>{input.relationshipForm.relationshipId ? '保存关系修改' : '新增人物关系'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setRelationshipForm(defaultRelationshipForm)}>清空表单</button>
          <hr style={styles.hr} />
          <label style={styles.label}>关系变化事件</label>
          <select style={styles.selectFull} value={input.relationshipEventForm.relationshipId} onChange={(e) => input.setRelationshipEventForm({ ...input.relationshipEventForm, relationshipId: e.target.value })}>
            <option value="">选择关系</option>
            {allRelationships.map((r: any) => <option key={r.id} value={r.id}>{r.sourceCharacterName} - {r.targetCharacterName}</option>)}
          </select>
          <FormTextarea label="变化摘要" value={input.relationshipEventForm.summary} onChange={(value) => input.setRelationshipEventForm({ ...input.relationshipEventForm, summary: value })} />
          <FormTextarea label="证据" value={input.relationshipEventForm.evidence} onChange={(value) => input.setRelationshipEventForm({ ...input.relationshipEventForm, evidence: value })} />
          <FormTextarea label="影响" value={input.relationshipEventForm.impact} onChange={(value) => input.setRelationshipEventForm({ ...input.relationshipEventForm, impact: value })} />
          <button type="button" style={styles.primaryButton} onClick={input.saveRelationshipEvent}>新增关系变化事件</button>
          <div style={styles.hint}>关系变化事件会进入待确认记录，不直接确认。</div>
          <div style={styles.notice}>保存后只更新 Phase 7.2 关系记录；不会生成不存在的关系，也不会进入 Phase 7.3。</div>
        </Panel>
      </section>
    </div>
  );
}

function renderForeshadowingTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = data.groups || {};
  const allThreads = groups.allThreads || [];
  const legacyThreads = allThreads.filter((thread: any) => thread.legacy);
  const editableThreads = allThreads.filter((thread: any) => !thread.legacy);
  const isEditing = Boolean(input.form.threadId);
  const canLock = isEditing && input.form.reviewStatus === 'confirmed';
  const cards = [
    ['总伏笔数', summary.totalThreads ?? 0],
    ['本章伏笔任务', summary.focusTasks ?? 0],
    ['全书伏笔', summary.fullBookThreads ?? 0],
    ['卷内伏笔', summary.volumeThreads ?? 0],
    ['章节伏笔', summary.chapterThreads ?? 0],
    ['待确认伏笔', summary.pendingReviewCount ?? 0],
    ['即将回收', summary.recoveryDueCount ?? 0],
    ['逾期风险', summary.overdueCount ?? 0],
    ['高风险伏笔', summary.highRiskCount ?? 0],
    ['locked 伏笔', summary.lockedCount ?? 0],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章伏笔雷达">
          {(groups.focusTasks || []).length ? groups.focusTasks.map((task: any) => (
            <ForeshadowingTaskCard key={task.id} task={task} input={input} />
          )) : <p style={styles.empty}>暂无本章伏笔任务。</p>}
        </Panel>
        <Panel title="伏笔风险提醒">
          <Line label="即将回收" value={(groups.recoveryDue || []).length ? groups.recoveryDue.map((t: any) => t.title).join(' / ') : EMPTY} />
          <Line label="逾期风险" value={(groups.overdue || []).length ? groups.overdue.map((t: any) => t.title).join(' / ') : EMPTY} />
          <Line label="高风险伏笔" value={(groups.highRisk || []).length ? groups.highRisk.map((t: any) => `${t.title}:${t.riskLevel}`).join(' / ') : EMPTY} />
          <Line label="待确认伏笔" value={(groups.pendingReview || []).length ? `${groups.pendingReview.length} 项待确认` : EMPTY} />
          <div style={styles.notice}>伏笔雷达读取 Phase 7.3 新生命周期数据和旧版伏笔。旧版只读展示，不静默迁移。</div>
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="伏笔生命周期">
          <Group title="本章必须处理" items={groups.focusTasks || groups.focusThreads || []} render={(item: any) => {
            if (item.taskType) return <ForeshadowingTaskCard task={item} input={input} />;
            return <ForeshadowingThreadCard thread={item} input={input} />;
          }} />
          <Group title="即将回收" items={groups.recoveryDue || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="逾期风险" items={groups.overdue || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="高风险伏笔" items={groups.highRisk || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="待确认伏笔" items={groups.pendingReview || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="全书伏笔" items={groups.fullBookThreads || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="卷内伏笔" items={groups.volumeThreads || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="章节伏笔" items={groups.chapterThreads || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="已回收伏笔" items={groups.recovered || []} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="全部伏笔" items={allThreads.filter((t: any) => !t.legacy)} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
          <Group title="旧版伏笔，只读兼容" items={legacyThreads} render={(thread: any) => <ForeshadowingThreadCard thread={thread} input={input} />} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>伏笔标题</label>
          <input style={styles.input} value={input.form.title} onChange={(e) => input.setForm({ ...input.form, title: e.target.value })} />
          <KnownSelect label="伏笔层级" options={FORESHADOWING_LEVELS} value={input.form.level} onChange={(value) => input.setForm({ ...input.form, level: value })} />
          <NumberInput label="卷序号" value={input.form.volumeIndex} onChange={(value) => input.setForm({ ...input.form, volumeIndex: value })} />
          <KnownSelect label="生命周期状态" options={FORESHADOWING_STATUSES} value={input.form.status} onChange={(value) => input.setForm({ ...input.form, status: value })} />
          <KnownSelect label="风险等级" options={FORESHADOWING_RISK_LEVELS} value={input.form.riskLevel} onChange={(value) => input.setForm({ ...input.form, riskLevel: value })} />
          <FormTextarea label="伏笔简述" value={input.form.summary} onChange={(value) => input.setForm({ ...input.form, summary: value })} />
          <FormTextarea label="读者理解" value={input.form.readerUnderstanding} onChange={(value) => input.setForm({ ...input.form, readerUnderstanding: value })} />
          <FormTextarea label="真实含义" value={input.form.trueMeaning} onChange={(value) => input.setForm({ ...input.form, trueMeaning: value })} />
          <FormTextarea label="揭示策略" value={input.form.revealStrategy} onChange={(value) => input.setForm({ ...input.form, revealStrategy: value })} />
          <FormTextarea label="风险原因" value={input.form.riskReason} onChange={(value) => input.setForm({ ...input.form, riskReason: value })} />
          <ChapterSelect label="计划埋设章节" chapters={input.chapters} value={input.form.plannedBuryChapterId} onChange={(value) => input.setForm({ ...input.form, plannedBuryChapterId: value })} />
          <ChapterSelect label="实际埋设章节" chapters={input.chapters} value={input.form.actualBuryChapterId} onChange={(value) => input.setForm({ ...input.form, actualBuryChapterId: value })} />
          <ChapterSelect label="回收窗口开始" chapters={input.chapters} value={input.form.recoveryWindowStartChapterId} onChange={(value) => input.setForm({ ...input.form, recoveryWindowStartChapterId: value })} />
          <ChapterSelect label="回收窗口结束" chapters={input.chapters} value={input.form.recoveryWindowEndChapterId} onChange={(value) => input.setForm({ ...input.form, recoveryWindowEndChapterId: value })} />
          <ChapterSelect label="实际回收章节" chapters={input.chapters} value={input.form.actualRecoveryChapterId} onChange={(value) => input.setForm({ ...input.form, actualRecoveryChapterId: value })} />
          <MultiSelect label="关联人物" options={input.characters.map((c: any) => ({ id: c.id, label: c.name }))} value={input.form.relatedCharacterIds} onChange={(value) => input.setForm({ ...input.form, relatedCharacterIds: value })} />
          <MultiSelect label="关联关系" options={input.relationships.map((r: any) => ({ id: r.id, label: `${r.sourceCharacterName || EMPTY} - ${r.targetCharacterName || EMPTY}` }))} value={input.form.relatedRelationshipIds} onChange={(value) => input.setForm({ ...input.form, relatedRelationshipIds: value })} />
          <label style={styles.label}>审核状态</label>
          {isEditing ? (
            <select style={styles.selectFull} value={input.form.reviewStatus} onChange={(e) => input.setForm({ ...input.form, reviewStatus: e.target.value, locked: e.target.value === 'confirmed' ? input.form.locked : false })}>
              {REVIEW_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          ) : <div style={styles.readonlyBox}>新增模式固定 pending + unlocked。</div>}
          <label style={styles.checkbox}>
            <input type="checkbox" checked={isEditing && input.form.locked} disabled={!canLock} onChange={(e) => input.setForm({ ...input.form, locked: e.target.checked })} /> 锁定伏笔
          </label>
          {!canLock && <div style={styles.hint}>{isEditing ? '先确认后才能锁定。' : '先创建并确认后才能锁定。'}</div>}
          <button type="button" style={styles.primaryButton} onClick={input.saveThread}>{isEditing ? '保存伏笔' : '新增伏笔'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setForm(defaultForeshadowingForm)}>清空伏笔表单</button>
          <hr style={styles.hr} />
          <label style={styles.label}>生命周期事件</label>
          <select style={styles.selectFull} value={input.eventForm.threadId} onChange={(e) => input.setEventForm({ ...input.eventForm, threadId: e.target.value })}>
            <option value="">选择伏笔</option>
            {editableThreads.map((thread: any) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
          </select>
          <KnownSelect label="事件类型" options={FORESHADOWING_EVENT_TYPES} value={input.eventForm.eventType} onChange={(value) => input.setEventForm({ ...input.eventForm, eventType: value })} />
          <FormTextarea label="事件摘要" value={input.eventForm.summary} onChange={(value) => input.setEventForm({ ...input.eventForm, summary: value })} />
          <FormTextarea label="证据" value={input.eventForm.evidence} onChange={(value) => input.setEventForm({ ...input.eventForm, evidence: value })} />
          <FormTextarea label="影响" value={input.eventForm.impact} onChange={(value) => input.setEventForm({ ...input.eventForm, impact: value })} />
          <button type="button" style={styles.primaryButton} onClick={input.saveEvent}>新增生命周期事件</button>
          <hr style={styles.hr} />
          <label style={styles.label}>当前章任务</label>
          <select style={styles.selectFull} value={input.taskForm.threadId} onChange={(e) => input.setTaskForm({ ...input.taskForm, threadId: e.target.value })}>
            <option value="">选择伏笔</option>
            {editableThreads.map((thread: any) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
          </select>
          <ChapterSelect label="任务章节" chapters={input.chapters} value={input.taskForm.chapterId} onChange={(value) => input.setTaskForm({ ...input.taskForm, chapterId: value })} />
          <KnownSelect label="任务类型" options={FORESHADOWING_TASK_TYPES} value={input.taskForm.taskType} onChange={(value) => input.setTaskForm({ ...input.taskForm, taskType: value })} />
          <KnownSelect label="优先级" options={TASK_PRIORITIES} value={input.taskForm.priority} onChange={(value) => input.setTaskForm({ ...input.taskForm, priority: value })} />
          <FormTextarea label="写作指令" value={input.taskForm.instruction} onChange={(value) => input.setTaskForm({ ...input.taskForm, instruction: value })} />
          <FormTextarea label="原因" value={input.taskForm.reason} onChange={(value) => input.setTaskForm({ ...input.taskForm, reason: value })} />
          <button type="button" style={styles.primaryButton} onClick={input.saveTask}>新增当前章任务</button>
          <div style={styles.notice}>伏笔、事件、任务的修改会持久化。AI 或手动提案默认进入待确认。</div>
        </Panel>
      </section>
    </div>
  );
}

function ForeshadowingThreadCard({ thread, input }: { thread: any; input: any }) {
  const canEdit = !thread.legacy;
  const isDerivedTask = thread.derived || thread.source === 'radar_derived';
  return (
    <details style={styles.itemCard}>
      <summary style={styles.itemSummary}>
        <strong>{thread.title || EMPTY}</strong>
        <span>{thread.level || EMPTY}</span>
        <span>{thread.status || EMPTY}</span>
        <span>{thread.riskLevel || EMPTY}{thread.locked ? ' / locked' : ''}{isDerivedTask ? ' / 雷达推导' : ''}</span>
      </summary>
      <Line label="伏笔简述" value={thread.summary || EMPTY} />
      <Line label="读者理解" value={thread.readerUnderstanding || EMPTY} />
      <Line label="真实含义" value={thread.trueMeaning || EMPTY} />
      <Line label="揭示策略" value={thread.revealStrategy || EMPTY} />
      <Line label="风险原因" value={thread.riskReason || EMPTY} />
      <Line label="埋设章节" value={thread.actualBuryChapterId || thread.plannedBuryChapterId || EMPTY} />
      <Line label="回收窗口" value={`${thread.recoveryWindowStartChapterId || EMPTY} -> ${thread.recoveryWindowEndChapterId || EMPTY}`} />
      <Line label="回收章节" value={thread.actualRecoveryChapterId || EMPTY} />
      <Line label="关联人物" value={(thread.relatedCharacterIds || []).join(' / ') || EMPTY} />
      <Line label="关联关系" value={(thread.relatedRelationshipIds || []).join(' / ') || EMPTY} />
      <Line label="生命周期事件" value={(thread.latestEvents || []).length ? thread.latestEvents.map((event: any) => `${event.eventType}:${event.summary || EMPTY}`).join(' / ') : EMPTY} />
      <Line label="章节任务" value={(thread.focusTasks || []).length ? thread.focusTasks.map((task: any) => `${task.taskType}:${task.instruction || EMPTY}`).join(' / ') : EMPTY} />
      {canEdit ? (
        <div style={styles.inlineActions}>
          <button type="button" style={styles.tinyButton} onClick={() => input.setForm({
            ...defaultForeshadowingForm,
            threadId: thread.id,
            title: thread.title || '',
            level: thread.level || 'chapter',
            volumeIndex: Number(thread.volumeIndex || 1),
            status: thread.status || 'planned',
            summary: thread.summary || '',
            readerUnderstanding: thread.readerUnderstanding || '',
            trueMeaning: thread.trueMeaning || '',
            revealStrategy: thread.revealStrategy || '',
            riskLevel: thread.riskLevel || 'none',
            riskReason: thread.riskReason || '',
            plannedBuryChapterId: thread.plannedBuryChapterId || '',
            actualBuryChapterId: thread.actualBuryChapterId || '',
            plannedDeepenChapterIds: thread.plannedDeepenChapterIds || [],
            plannedMisdirectChapterIds: thread.plannedMisdirectChapterIds || [],
            recoveryWindowStartChapterId: thread.recoveryWindowStartChapterId || '',
            recoveryWindowEndChapterId: thread.recoveryWindowEndChapterId || '',
            actualRecoveryChapterId: thread.actualRecoveryChapterId || '',
            relatedCharacterIds: thread.relatedCharacterIds || [],
            relatedRelationshipIds: thread.relatedRelationshipIds || [],
            relatedTimelineEventIds: thread.relatedTimelineEventIds || [],
            relatedWorldRuleIds: thread.relatedWorldRuleIds || [],
            reviewStatus: thread.reviewStatus || 'pending',
            locked: Boolean(thread.locked),
          })}>编辑</button>
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchThread(thread, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!thread.locked && thread.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchThread(thread, { locked: !thread.locked, forceUnlock: thread.locked });
          }}>{thread.locked ? '解锁' : '锁定'}</button>
        </div>
      ) : <div style={styles.hint}>旧版伏笔在 Phase 7.3 中只读展示。</div>}
    </details>
  );
}

function ForeshadowingTaskCard({ task, input }: { task: any; input: any }) {
  const isDerived = task.derived || task.source === 'radar_derived';
  return (
    <div style={styles.itemCard}>
      <Line label="关联伏笔" value={task.threadTitle || task.threadId || EMPTY} />
      <Line label="任务" value={`${TASK_TYPE_LABELS[task.taskType] || task.taskType || EMPTY} / ${task.priority || EMPTY} / ${task.status || EMPTY}`} />
      <Line label="写作指令" value={task.instruction || EMPTY} />
      <Line label="原因" value={task.reason || EMPTY} />
      <Line label="审核" value={`${task.reviewStatus || EMPTY}${task.locked ? ' / locked' : ''}${isDerived ? ' / 雷达推导' : ''}`} />
      {!task.legacy && (
        <div style={styles.inlineActions}>
          {TASK_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchTask(task, { status })}>{status}</button>)}
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchTask(task, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!task.locked && task.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchTask(task, { locked: !task.locked });
          }}>{task.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character, input }: { character: any; input: any }) {
  const snapshots = character.latestStateSnapshots || [];
  return (
    <details style={styles.itemCard}>
      <summary style={styles.itemSummary}>
        <strong>{character.name || EMPTY}</strong>
        <span>{character.identity || EMPTY}</span>
        <span>待确认 {character.pendingReviewCount || 0}</span>
        <span>{(character.riskTags || []).join(' / ') || '无风险标签'}</span>
      </summary>
      <Line label="当前目标" value={character.currentGoal || EMPTY} />
      <Line label="当前状态摘要" value={character.currentStateSummary || EMPTY} />
      <Line label="说话方式" value={character.dialogueStyle || EMPTY} />
      <Line label="关系摘要" value={character.relationshipSummary || EMPTY} />
      <Line label="最近状态来源章节" value={character.sourceChapterId || EMPTY} />
      <Line label="基础信息" value={character.identity || EMPTY} />
      <Line label="性格特质" value={stringifySearchable(character.personality) || EMPTY} />
      <Line label="行为习惯" value={EMPTY} />
      <Line label="表层目标" value={character.currentGoal || EMPTY} />
      <Line label="深层欲望" value={EMPTY} />
      <Line label="恐惧" value={EMPTY} />
      <Line label="底线" value={EMPTY} />
      <Line label="成长弧光" value={EMPTY} />
      <Line label="分卷变化" value={EMPTY} />
      <Line label="章节变化" value={snapshots.length ? snapshots.map((s: any) => `${s.stateType}:${s.currentState || EMPTY}`).join('；') : EMPTY} />
      <Line label="关联伏笔" value={EMPTY} />
      {snapshots.map((state: any) => (
        <div key={state.id} style={styles.inlineActions}>
          <span>{state.stateType} / {state.reviewStatus} / {state.locked ? 'locked' : 'unlocked'} / {state.source}</span>
          <Line label="对目标的影响" value={state.goalImpact || EMPTY} />
          <Line label="对伏笔的影响" value={state.foreshadowingImpact || EMPTY} />
          <button type="button" style={styles.tinyButton} onClick={() => input.setStateForm({ ...defaultStateForm, stateId: state.id, characterId: character.id, stateType: state.stateType, currentState: state.currentState, evidence: state.evidence, cause: state.cause, actionImpact: state.actionImpact, relationImpact: state.relationImpact, goalImpact: state.goalImpact, foreshadowingImpact: state.foreshadowingImpact, futureChange: state.futureChange, conflictRisk: state.conflictRisk, reviewStatus: state.reviewStatus, locked: state.locked })}>编辑</button>
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchStateSnapshot(state, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!state.locked && state.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchStateSnapshot(state, { locked: !state.locked, forceUnlock: state.locked });
          }}>{state.locked ? '解锁' : '锁定'}</button>
        </div>
      ))}
    </details>
  );
}

function RelationshipCard({ relationship, input }: { relationship: any; input: any }) {
  return (
    <details style={styles.itemCard}>
      <summary style={styles.itemSummary}>
        <strong>{relationship.sourceCharacterName || EMPTY} - {relationship.targetCharacterName || EMPTY}</strong>
        <span>信任 {relationship.trustScore}</span>
        <span>冲突 {relationship.conflictScore}</span>
        <span>{relationship.reviewStatus}{relationship.locked ? ' / locked' : ''}</span>
      </summary>
      <Line label="关系类型" value={relationship.relationType || EMPTY} />
      <Line label="公开关系" value={relationship.publicRelation || EMPTY} />
      <Line label="隐藏关系" value={relationship.hiddenRelation || EMPTY} />
      <Line label="情感倾向" value={relationship.emotionalTendency || EMPTY} />
      <Line label="利益绑定" value={relationship.interestBinding || EMPTY} />
      <Line label="首次建立章节" value={relationship.firstChapterId || EMPTY} />
      <Line label="最近变化章节" value={relationship.latestChapterId || EMPTY} />
      <Line label="当前阶段" value={relationship.currentPhase || EMPTY} />
      <Line label="变化摘要" value={relationship.changeSummary || EMPTY} />
      <Line label="读者已知状态" value={relationship.readerKnownState || EMPTY} />
      <Line label="双方已知状态" value={`A: ${relationship.sourceKnownState || EMPTY} / B: ${relationship.targetKnownState || EMPTY}`} />
      <Line label="关联伏笔" value={(relationship.relatedForeshadowingIds || []).join(' / ') || EMPTY} />
      <Line label="关联时间线事件" value={(relationship.relatedTimelineEventIds || []).join(' / ') || EMPTY} />
      <Line label="关系变化事件" value={(relationship.events || []).length ? relationship.events.map((e: any) => e.summary || e.event_type).join('；') : EMPTY} />
      <div style={styles.inlineActions}>
        <button type="button" style={styles.tinyButton} onClick={() => input.setRelationshipForm({ ...defaultRelationshipForm, relationshipId: relationship.id, sourceCharacterId: relationship.sourceCharacterId, targetCharacterId: relationship.targetCharacterId, relationType: relationship.relationType, publicRelation: relationship.publicRelation === EMPTY ? '' : relationship.publicRelation, hiddenRelation: relationship.hiddenRelation, trustScore: relationship.trustScore, conflictScore: relationship.conflictScore, emotionalTendency: relationship.emotionalTendency === EMPTY ? '' : relationship.emotionalTendency, interestBinding: relationship.interestBinding === EMPTY ? '' : relationship.interestBinding, currentPhase: relationship.currentPhase === EMPTY ? '' : relationship.currentPhase, readerKnownState: relationship.readerKnownState, sourceKnownState: relationship.sourceKnownState, targetKnownState: relationship.targetKnownState, changeSummary: relationship.changeSummary, reviewStatus: relationship.reviewStatus, locked: relationship.locked })}>编辑</button>
        {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchRelationship(relationship, { reviewStatus: status })}>{status}</button>)}
        <button type="button" style={styles.tinyButton} onClick={() => {
          if (!relationship.locked && relationship.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
          return input.patchRelationship(relationship, { locked: !relationship.locked });
        }}>{relationship.locked ? '解锁' : '锁定'}</button>
      </div>
    </details>
  );
}

function renderFutureTab(tab: TabKey) {
  const phaseMap: Record<string, string> = {
    foreshadowing: 'Phase 7.3 将接入伏笔雷达与生命周期。',
    world: 'Phase 7.4 将接入世界观规则系统。',
    timeline: 'Phase 7.4 将接入时间线三线模型。',
    precheck: 'Phase 7.5 将接入写作前检查。',
    postupdate: 'Phase 7.5 将接入写作后更新闭环。',
  };
  return (
    <Panel title="分期入口">
      <p style={styles.empty}>{phaseMap[tab] || '后续阶段实现。'}</p>
      <p style={styles.empty}>当前只展示入口和空态，不生成占位关系、占位伏笔或不存在的规则。</p>
    </Panel>
  );
}

function Group({ title, items, render }: { title: string; items: any[]; render: (item: any) => React.ReactNode }) {
  return (
    <div style={styles.group}>
      <h3 style={styles.groupTitle}>{title}</h3>
      {items.length ? items.map((item) => <React.Fragment key={item.id}>{render(item)}</React.Fragment>) : <p style={styles.empty}>暂无数据。</p>}
    </div>
  );
}

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={styles.panel}>
    <h2 style={styles.panelTitle}>{title}</h2>
    {children}
  </section>
);

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.statCard}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const Line: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.line}>
    <span>{label}</span>
    <strong>{value || EMPTY}</strong>
  </div>
);

function FormTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label style={styles.label}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} style={styles.textarea} />
    </>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <>
      <label style={styles.label}>{label}</label>
      <input type="number" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} style={styles.input} />
    </>
  );
}

function KnownSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label style={styles.label}>{label}</label>
      <select style={styles.selectFull} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </>
  );
}

function ChapterSelect({ label, chapters, value, onChange }: { label: string; chapters: Chapter[]; value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label style={styles.label}>{label}</label>
      <select style={styles.selectFull} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {chapters.map(ch => <option key={ch.id} value={ch.id}>{volumeIndex(ch)}-{chapterIndex(ch)} {ch.title}</option>)}
      </select>
    </>
  );
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <>
      <label style={styles.label}>{label}</label>
      <select
        multiple
        style={{ ...styles.selectFull, minHeight: 96 }}
        value={value}
        onChange={(e) => onChange(Array.from(e.currentTarget.selectedOptions).map(option => option.value))}
      >
        {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </>
  );
}

function readView(key: string) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}

function writeView(key: string, value: Record<string, unknown>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function chapterSort(a: Chapter, b: Chapter) {
  return volumeIndex(a) - volumeIndex(b) || chapterIndex(a) - chapterIndex(b);
}

function volumeIndex(ch: Chapter) { return Number(ch.volumeIndex ?? ch.volume_index ?? 1); }
function chapterIndex(ch: Chapter) { return Number(ch.chapterIndex ?? ch.chapter_index ?? 1); }
function wordCount(ch: Chapter) { return Number(ch.wordCount ?? ch.word_count ?? 0); }

function flattenOutlines(items: any[]): any[] {
  return items.flatMap(item => [item, ...flattenOutlines(item.children || [])]);
}

function findFocusOutline(chapter: Chapter | null, outlines: any[]) {
  if (!chapter) return null;
  return outlines.find(item => item.id === (chapter.outlineId || chapter.outline_id))
    || outlines.find(item => Number(item.order ?? 0) + 1 === chapterIndex(chapter) && item.level === 'chapter')
    || null;
}

function extractGoal(outline: any) {
  if (!outline) return '';
  const detail = outline.detail || safeJson(outline.detail_json);
  return detail.chapterGoal || detail.chapter_goal || detail.chapterFunction || outline.content?.split('\n')[0] || '';
}

function findRelatedCharacters(characters: any[], chapter: Chapter | null, outline: any) {
  if (!chapter) return [];
  const text = `${chapter.title || ''}\n${chapter.content || ''}\n${outline?.content || ''}`;
  return characters.filter(c => c.name && text.includes(c.name)).slice(0, 8);
}

function findRelatedForeshadowings(items: any[], chapter: Chapter | null, index: number) {
  if (!chapter) return [];
  return items.filter(item => {
    const buried = Number(item.buriedChapterIndex ?? item.buried_chapter_index ?? -1);
    const recover = Number(item.plannedRecoveryChapterIndex ?? item.planned_recovery_chapter_index ?? -1);
    return buried === index || recover === index || recover > 0 && recover <= index + 2;
  }).slice(0, 8);
}

function findRelatedTimelineEvents(events: any[], chapter: Chapter | null) {
  if (!chapter) return [];
  return events.filter(event => {
    const ids = event.relatedChapterIds || event.related_chapter_ids || [];
    return Array.isArray(ids) ? ids.includes(chapter.id) : stringifySearchable(ids).includes(chapter.id);
  }).slice(0, 8);
}

function groupTaskNotes(tasks: any[]) {
  const grouped = tasks.reduce((acc: Record<string, string[]>, task: any) => {
    const key = task.taskType || 'check';
    acc[key] = acc[key] || [];
    acc[key].push(`${task.threadTitle || task.threadId || EMPTY}: ${task.instruction || task.reason || task.status || EMPTY}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([type, items]) => `${TASK_TYPE_LABELS[type] || type}: ${items.join(' / ')}`).join(' | ');
}

function buildPreWritingPrompt(input: any) {
  const ch = input.focusChapter as Chapter | null;
  if (!ch) return '待创建章节后生成。';
  return [
    `当前章节信息：第${volumeIndex(ch)}卷第${chapterIndex(ch)}章《${ch.title}》，状态 ${ch.status || 'draft'}，字数 ${wordCount(ch)}`,
    `前情提要：${input.focusOutline?.content?.slice(0, 240) || EMPTY}`,
    `本章目标：${input.manualGoal || extractGoal(input.focusOutline) || EMPTY}`,
    `出场人物：${input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => c.name).join('、') : EMPTY}`,
    `人物状态注意事项：${input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => `${c.name}-${c.currentStateSummary || c.identity || EMPTY}`).join('；') : EMPTY}`,
    `关系注意事项：${input.relatedRelationships.length ? input.relatedRelationships.map((r: any) => `${r.sourceCharacterName}-${r.targetCharacterName}:${r.publicRelation || EMPTY}`).join('；') : EMPTY}`,
    `伏笔注意事项：${input.focusForeshadowingTasks?.length ? groupTaskNotes(input.focusForeshadowingTasks) : input.relatedForeshadowings.length ? input.relatedForeshadowings.map((f: any) => f.content || f.title).join('；') : EMPTY}`,
    '世界观注意事项：待补全，Phase 7.4 将接入世界观规则系统。',
    `时间线注意事项：${input.relatedTimelineEvents.length ? input.relatedTimelineEvents.map((e: any) => e.title).join('；') : EMPTY}`,
    '冲突设计：待补全。',
    '爽点 / 压迫点：待补全。',
    '结尾钩子：待补全。',
    `禁止写错事项：${input.manualForbidden || 'locked 章节不可自动修改；已确认设定不可被当前页面直接覆盖；AI 生成内容必须进入待确认。'}`,
    `作者备注：${input.manualNotes || '无'}`,
  ].join('\n');
}

function safeJson(raw: string) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function stringifySearchable(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function searchableFields(values: any[]): string {
  return values.map(stringifySearchable).filter(Boolean).join('\n').toLowerCase();
}

function countKeywordMatches(texts: string[], keywords: string[]): number {
  return texts.filter(text => keywords.some(keyword => text.includes(keyword.toLowerCase()))).length;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('copy failed');
  } finally {
    document.body.removeChild(textarea);
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 1320, margin: '0 auto', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' },
  loading: { padding: 40, color: '#94a3b8', textAlign: 'center' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18 },
  kicker: { fontSize: 12, color: '#60a5fa', fontWeight: 700, marginBottom: 4 },
  title: { margin: 0, fontSize: 26 },
  subtitle: { margin: '6px 0 0', color: '#94a3b8', fontSize: 13 },
  focusBar: { display: 'flex', gap: 12, alignItems: 'center', padding: 14, border: '1px solid #334155', background: '#111827', borderRadius: 8, marginBottom: 14, flexWrap: 'wrap' },
  label: { fontSize: 12, color: '#94a3b8', fontWeight: 700, display: 'block', marginTop: 8 },
  checkbox: { fontSize: 12, color: '#cbd5e1', display: 'block', margin: '8px 0' },
  select: { background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', minWidth: 320 },
  selectFull: { width: '100%', background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', margin: '6px 0 10px' },
  input: { width: '100%', background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', margin: '6px 0 10px' },
  readonlyBox: { width: '100%', background: '#020617', color: '#93c5fd', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', margin: '6px 0 10px', fontSize: 12 },
  hint: { color: '#fbbf24', fontSize: 12, margin: '4px 0 10px' },
  savedHint: { color: '#64748b', fontSize: 12 },
  phasePanel: { border: '1px solid #334155', borderRadius: 8, padding: 14, marginBottom: 14, background: '#0f172a' },
  phaseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 },
  phaseItem: { border: '1px solid', borderRadius: 6, padding: 10, display: 'grid', gap: 4, fontSize: 12 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 8 },
  tab: { background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  tabActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 },
  statCard: { background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: 14, display: 'grid', gap: 8 },
  twoColumns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(340px, .8fr)', gap: 14, marginBottom: 14 },
  panel: { background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 14 },
  panelTitle: { margin: '0 0 12px', fontSize: 15, color: '#f8fafc' },
  group: { marginBottom: 16 },
  groupTitle: { margin: '10px 0 8px', fontSize: 13, color: '#bfdbfe' },
  itemCard: { border: '1px solid rgba(148,163,184,.20)', borderRadius: 8, padding: 10, marginBottom: 8, background: '#0f172a' },
  itemSummary: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1.2fr) repeat(3, minmax(90px, .8fr))', gap: 8, cursor: 'pointer', fontSize: 12 },
  line: { display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,.12)', fontSize: 13 },
  inlineActions: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12 },
  tinyButton: { background: '#1e293b', color: '#dbeafe', border: '1px solid #334155', borderRadius: 6, padding: '4px 7px', cursor: 'pointer' },
  primaryButton: { background: '#2563eb', color: '#fff', border: '1px solid #3b82f6', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', marginRight: 8, marginBottom: 8 },
  secondaryButton: { background: '#0f172a', color: '#dbeafe', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', marginRight: 8, marginBottom: 8 },
  copyButton: { background: '#2563eb', color: '#fff', border: '1px solid #3b82f6', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', marginBottom: 10 },
  empty: { color: '#94a3b8', fontSize: 13, lineHeight: 1.7 },
  textarea: { width: '100%', minHeight: 72, resize: 'vertical', background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: 10, margin: '6px 0 12px', fontFamily: 'inherit' },
  notice: { fontSize: 12, color: '#93c5fd', background: 'rgba(37,99,235,.10)', border: '1px solid rgba(59,130,246,.24)', borderRadius: 6, padding: 10, marginBottom: 12 },
  error: { color: '#fecaca', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: 12, marginBottom: 12 },
  hr: { border: 0, borderTop: '1px solid #334155', margin: '14px 0' },
};

export default ContinuityCockpitPage;
