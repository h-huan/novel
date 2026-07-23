import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

const payload = <T,>(res: any): T => res?.data ?? res;

function normalizeArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'list', 'rows']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }

  return [];
}

function normalizeGroups(value: unknown): Record<string, any[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeArray(item)]),
  );
}

const EMPTY = '尚未记录';
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

const STATE_TYPES = ['physical', 'emotion', 'goal', 'identity', 'relationship', 'resource', 'secret', 'ability', 'restriction', 'reputation', 'location', 'arc'];
const REVIEW_STATUSES = ['pending', 'confirmed', 'ignored', 'conflict'];
const RELATION_TYPES = ['ally', 'enemy', 'family', 'mentor', 'disciple', 'superior', 'subordinate', 'rival', 'lover_like', 'debt', 'benefit', 'hidden', 'unknown', 'other'];
const KNOWN_STATES = ['unknown', 'partial', 'known', 'misunderstood'];
const READER_STATES = ['unknown', 'hinted', 'known', 'misdirected'];
const FORESHADOWING_LEVELS = ['full_book', 'volume', 'chapter'];
const FORESHADOWING_STATUSES = ['planned', 'buried', 'deepened', 'misdirected', 'recovery_due', 'recovered', 'overdue', 'conflict', 'abandoned'];
const FORESHADOWING_RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
const FORESHADOWING_EVENT_TYPES = ['planned', 'buried', 'deepened', 'misdirected', 'hinted', 'recovered', 'delayed', 'cancelled', 'conflict', 'other'];
const WORLD_RULE_TYPES = ['geography', 'era', 'society', 'law', 'profession', 'organization', 'technology', 'power_system', 'resource', 'culture', 'economy', 'family', 'custom'];
const WORLD_RULE_SCOPES = ['full_book', 'volume', 'chapter', 'location', 'organization', 'character', 'relationship'];
const WORLD_RULE_RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
const WORLD_RULE_EVENT_TYPES = ['established', 'used', 'verified', 'changed', 'violated', 'revealed', 'conflict', 'deprecated', 'other'];
const WORLD_RULE_TASK_TYPES = ['apply', 'check', 'reveal', 'avoid_contradiction', 'update_rule', 'verify'];
const TIMELINE_LINE_TYPES = ['story_time', 'narrative_order', 'causality'];
const TIMELINE_LINK_TYPES = ['cause', 'effect', 'condition', 'motivation', 'information', 'misdirection', 'contradiction', 'parallel', 'other'];
const TIMELINE_TASK_TYPES = ['place_event', 'check_order', 'check_causality', 'reveal_information', 'avoid_time_conflict', 'sync_lines'];
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

const defaultWorldRuleForm = {
  ruleId: '', title: '', ruleType: 'law', scope: 'full_book', volumeIndex: 1,
  content: '', explanation: '', limitation: '', contradictionRisk: '',
  status: 'planned', riskLevel: 'none',
  firstEstablishedChapterId: '', lastVerifiedChapterId: '',
  relatedCharacterIds: [] as string[], relatedRelationshipIds: [] as string[],
  relatedForeshadowingIds: [] as string[], relatedTimelineEventIds: [] as string[],
  reviewStatus: 'pending', locked: false,
};

const defaultWorldRuleEventForm = {
  ruleId: '', chapterId: '', eventType: 'other', summary: '', evidence: '', impact: '',
};

const defaultWorldRuleTaskForm = {
  ruleId: '', chapterId: '', taskType: 'check', priority: 'medium', instruction: '', reason: '',
};

const defaultTimelineEventForm = {
  eventId: '', title: '', summary: '', lineType: 'story_time',
  chapterId: '', volumeIndex: 1, chapterIndex: 1,
  storyTimeText: '', storyTimeOrder: 0, narrativeOrder: 0, causalityOrder: 0,
  location: '', participantsCharacterIds: [] as string[],
  relatedRelationshipIds: [] as string[], relatedForeshadowingIds: [] as string[],
  relatedWorldRuleIds: [] as string[],
  readerKnownState: 'unknown', characterKnownState: 'unknown',
  status: 'planned', riskLevel: 'none', riskReason: '',
  reviewStatus: 'pending', locked: false,
};

const defaultTimelineLinkForm = {
  linkId: '', sourceEventId: '', targetEventId: '', linkType: 'cause',
  summary: '', evidence: '', riskLevel: 'none', riskReason: '',
  reviewStatus: 'pending', locked: false,
};

const defaultTimelineTaskForm = {
  eventId: '', chapterId: '', taskType: 'check_order', priority: 'medium', instruction: '', reason: '',
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
  const [continuityWorldRules, setContinuityWorldRules] = useState<any | null>(null);
  const [continuityTimeline, setContinuityTimeline] = useState<any | null>(null);
  const [precheckResult, setPrecheckResult] = useState<any | null>(null);
  const [postupdateResult, setPostupdateResult] = useState<any | null>(null);
  const [phase75Loading, setPhase75Loading] = useState(false);
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
  const [worldRuleForm, setWorldRuleForm] = useState(defaultWorldRuleForm);
  const [worldRuleEventForm, setWorldRuleEventForm] = useState(defaultWorldRuleEventForm);
  const [worldRuleTaskForm, setWorldRuleTaskForm] = useState(defaultWorldRuleTaskForm);
  const [timelineEventForm, setTimelineEventForm] = useState(defaultTimelineEventForm);
  const [timelineLinkForm, setTimelineLinkForm] = useState(defaultTimelineLinkForm);
  const [timelineTaskForm, setTimelineTaskForm] = useState(defaultTimelineTaskForm);

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
      const chapterData = chaptersRes.status === 'fulfilled' ? normalizeArray<Chapter>(payload(chaptersRes.value)) : [];
      const timelineData = timelinesRes.status === 'fulfilled' ? normalizeArray<any>(payload(timelinesRes.value)) : [];
      setProject(projectData?.data || projectData || null);
      setChapters(chapterData);
      setOutlines(outlinesRes.status === 'fulfilled' ? normalizeArray<any>(payload(outlinesRes.value)) : []);
      setLegacyCharacters(charactersRes.status === 'fulfilled' ? normalizeArray<any>(payload(charactersRes.value)) : []);
      setForeshadowings(foreshadowRes.status === 'fulfilled' ? normalizeArray<any>(payload(foreshadowRes.value)) : []);
      setTimelines(timelineData);
      setStateItems(stateRes.status === 'fulfilled' ? normalizeArray<any>(payload(stateRes.value)) : []);
      setQualityReports(reportsRes.status === 'fulfilled' ? normalizeArray<any>(payload(reportsRes.value)) : []);

      const eventResults = await Promise.allSettled(timelineData.map(t => api.get(`/projects/${projectId}/timelines/${t.id}/events`)));
      setTimelineEvents(eventResults.flatMap(result => result.status === 'fulfilled' ? normalizeArray<any>(payload(result.value)) : []));
    } catch (err: any) {
      setError(err.message || '全书脉络加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadContinuity = useCallback(async () => {
    if (!projectId) return;
    setContinuityLoading(true);
    try {
      const suffix = focusChapterId ? `?focusChapterId=${encodeURIComponent(focusChapterId)}` : '';
      const [characterRes, relationshipRes, foreshadowingRes, worldRes, timelineRes] = await Promise.allSettled([
        api.get(`/projects/${projectId}/continuity/characters${suffix}`),
        api.get(`/projects/${projectId}/continuity/relationships${suffix}`),
        api.get(`/projects/${projectId}/continuity/foreshadowings${suffix}`),
        api.get(`/projects/${projectId}/continuity/world-rules${suffix}`),
        api.get(`/projects/${projectId}/continuity/timeline${suffix}`),
      ]);
      if (characterRes.status === 'fulfilled') setContinuityCharacters(payload<any>(characterRes.value));
      if (relationshipRes.status === 'fulfilled') setContinuityRelationships(payload<any>(relationshipRes.value));
      if (foreshadowingRes.status === 'fulfilled') setContinuityForeshadowings(payload<any>(foreshadowingRes.value));
      if (worldRes.status === 'fulfilled') setContinuityWorldRules(payload<any>(worldRes.value));
      if (timelineRes.status === 'fulfilled') setContinuityTimeline(payload<any>(timelineRes.value));
    } catch (err: any) {
      setError(err.message || '小说资料加载失败');
    } finally {
      setContinuityLoading(false);
    }
  }, [projectId, focusChapterId]);

  const loadPhase75 = useCallback(async () => {
    if (!projectId) return;
    setPhase75Loading(true);
    try {
      const suffix = focusChapterId ? `?focusChapterId=${encodeURIComponent(focusChapterId)}` : '';
      const [precheckRes, postupdateRes] = await Promise.allSettled([
        api.get(`/projects/${projectId}/continuity/precheck${suffix}`),
        api.get(`/projects/${projectId}/continuity/postupdate${suffix}`),
      ]);
      if (precheckRes.status === 'fulfilled') setPrecheckResult(payload<any>(precheckRes.value));
      if (postupdateRes.status === 'fulfilled') setPostupdateResult(payload<any>(postupdateRes.value));
    } catch (err: any) {
      setError(err.message || '写作资料加载失败');
    } finally {
      setPhase75Loading(false);
    }
  }, [projectId, focusChapterId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadContinuity(); }, [loadContinuity]);
  useEffect(() => { loadPhase75(); }, [loadPhase75]);

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
  const focusCharacterItems = normalizeArray<any>(continuityCharacters?.groups?.focusCharacters);
  const focusRelationshipItems = normalizeArray<any>(continuityRelationships?.groups?.focusRelationships);
  const focusForeshadowingTasks = normalizeArray<any>(continuityForeshadowings?.groups?.focusTasks);
  const focusWorldTasks = normalizeArray<any>(continuityWorldRules?.groups?.focusTasks);
  const focusWorldRules = normalizeArray<any>(continuityWorldRules?.groups?.focusRules);
  const focusTimelineTasks = normalizeArray<any>(continuityTimeline?.groups?.focusTasks);
  const focusTimelineEvents = normalizeArray<any>(continuityTimeline?.groups?.focusEvents);
  const relatedCharacters = focusCharacterItems.length ? focusCharacterItems : findRelatedCharacters(legacyCharacters, focusChapter, focusOutline);
  const pendingItems = useMemo(() => stateItems.filter(item => ['pending', 'draft', 'needs_review'].includes(item.status)), [stateItems]);
  const reportSearchTexts = useMemo(() => qualityReports.map(report => searchableFields([report.payload, report.summary, report.title, report.issueSummary, report.issue_summary])), [qualityReports]);
  const stateItemSearchTexts = useMemo(() => stateItems.map(item => searchableFields([item.payload, item.summary, item.title, item.targetType, item.target_type])), [stateItems]);
  const timelineRisks = qualityReports.reduce((sum, report) => sum + Number(report.timelineRiskCount || 0), 0)
    + countKeywordMatches(reportSearchTexts, RISK_KEYWORDS.timeline)
    + countKeywordMatches(stateItemSearchTexts, RISK_KEYWORDS.timeline);
  const worldRuleRisksFromSummary = Number(continuityWorldRules?.summary?.highRiskCount || 0) + Number(continuityWorldRules?.summary?.conflictCount || 0);
  const timelineRisksFromSummary = Number(continuityTimeline?.summary?.timeConflictCount || 0) + Number(continuityTimeline?.summary?.causalityGapCount || 0);
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
      + Number(continuityForeshadowings?.summary?.pendingReviewCount || 0)
      + Number(continuityWorldRules?.summary?.pendingReviewCount || 0)
      + Number(continuityTimeline?.summary?.pendingReviewCount || 0),
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
    focusWorldRules: Number(continuityWorldRules?.summary?.focusRules || 0),
    focusWorldTasks: Number(continuityWorldRules?.summary?.focusTasks || 0),
    worldRuleConflicts: Number(continuityWorldRules?.summary?.conflictCount || 0),
    worldRuleHighRisk: Number(continuityWorldRules?.summary?.highRiskCount || 0),
    focusTimelineEvents: Number(continuityTimeline?.summary?.focusEvents || 0),
    focusTimelineTasks: Number(continuityTimeline?.summary?.focusTasks || 0),
    timeConflicts: Number(continuityTimeline?.summary?.timeConflictCount || 0),
    causalityGaps: Number(continuityTimeline?.summary?.causalityGapCount || 0),
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
    focusWorldTasks,
    focusWorldRules,
    focusTimelineTasks,
    focusTimelineEvents,
    manualGoal,
    manualForbidden,
    manualNotes,
  }), [project, focusChapter, focusOutline, relatedCharacters, focusRelationshipItems, relatedForeshadowings, focusForeshadowingTasks, relatedTimelineEvents, focusWorldTasks, focusWorldRules, focusTimelineTasks, focusTimelineEvents, manualGoal, manualForbidden, manualNotes]);

  const visiblePrompt = focusChapter ? manualPrompt || generatedPrompt : '待创建章节后生成。';

  const handleCopyPrompt = useCallback(async () => {
    try {
      await copyText(visiblePrompt);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }, [visiblePrompt]);

  const runPrecheck = async () => {
    const result = await api.post(`/projects/${projectId}/continuity/precheck/run`, { focusChapterId });
    setPrecheckResult(payload<any>(result));
    setNotice('写作前检查已重新运行。');
  };

  const runPostupdate = async () => {
    const result = await api.post(`/projects/${projectId}/continuity/postupdate/run`, { focusChapterId });
    setPostupdateResult(payload<any>(result));
    setNotice('写作后更新分析已重新运行。');
  };

  const copyPrecheckSummary = async () => {
    await copyText(formatPrecheckResult(precheckResult));
    setNotice('写作前检查结果已复制。');
  };

  const copyPostupdateSummary = async () => {
    await copyText(formatPostupdateResult(postupdateResult));
    setNotice('写作后更新摘要已复制。');
  };

  const applyPostupdateSuggestion = async (suggestion: any, action: 'confirm' | 'ignore' | 'conflict') => {
    await api.post(`/projects/${projectId}/continuity/postupdate/suggestions/${encodeURIComponent(suggestion.id)}/${action}`, { suggestion });
    setNotice(action === 'confirm' ? '已生成 pending 待确认项。' : action === 'ignore' ? '已记录为 ignored。' : '已记录为 conflict。');
    await loadPhase75();
  };

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
    if (!foreshadowingForm.title.trim()) return setNotice('请填写伏笔标题。');
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
    setNotice(isEditing ? '伏笔修改已保存。' : '伏笔已保存为待确认记录，需要确认后才能锁定。');
    setForeshadowingForm(defaultForeshadowingForm);
    await loadContinuity();
  };

  const patchForeshadowingThread = async (thread: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/foreshadowings/${thread.id}`, patch);
    await loadContinuity();
  };

  const saveForeshadowingEvent = async () => {
    if (!foreshadowingEventForm.threadId) return setNotice('请先选择伏笔。');
    await api.post(`/projects/${projectId}/continuity/foreshadowings/${foreshadowingEventForm.threadId}/events`, {
      chapterId: focusChapter?.id,
      eventType: foreshadowingEventForm.eventType,
      summary: foreshadowingEventForm.summary,
      evidence: foreshadowingEventForm.evidence,
      impact: foreshadowingEventForm.impact,
      source: 'manual',
    });
    setNotice('伏笔生命周期事件已保存为待确认记录。');
    setForeshadowingEventForm(defaultForeshadowingEventForm);
    await loadContinuity();
  };

  const saveForeshadowingTask = async () => {
    if (!foreshadowingTaskForm.threadId || !foreshadowingTaskForm.chapterId) return setNotice('请先选择伏笔和任务章节。');
    await api.post(`/projects/${projectId}/continuity/foreshadowing-tasks`, {
      threadId: foreshadowingTaskForm.threadId,
      chapterId: foreshadowingTaskForm.chapterId,
      taskType: foreshadowingTaskForm.taskType,
      priority: foreshadowingTaskForm.priority,
      instruction: foreshadowingTaskForm.instruction,
      reason: foreshadowingTaskForm.reason,
      source: 'manual',
    });
    setNotice('当前章伏笔任务已保存为待确认记录。');
    setForeshadowingTaskForm(defaultForeshadowingTaskForm);
    await loadContinuity();
  };

  const patchForeshadowingTask = async (task: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/foreshadowing-tasks/${task.id}`, patch);
    await loadContinuity();
  };


  const saveWorldRule = async () => {
    if (!worldRuleForm.title.trim()) return setNotice('请填写规则标题。');
    const isEditing = Boolean(worldRuleForm.ruleId);
    const body = {
      title: worldRuleForm.title, ruleType: worldRuleForm.ruleType, scope: worldRuleForm.scope,
      volumeIndex: Number(worldRuleForm.volumeIndex || 1), content: worldRuleForm.content,
      explanation: worldRuleForm.explanation, limitation: worldRuleForm.limitation,
      contradictionRisk: worldRuleForm.contradictionRisk, riskLevel: worldRuleForm.riskLevel,
      firstEstablishedChapterId: worldRuleForm.firstEstablishedChapterId || undefined,
      lastVerifiedChapterId: worldRuleForm.lastVerifiedChapterId || undefined,
      relatedCharacterIds: worldRuleForm.relatedCharacterIds,
      relatedRelationshipIds: worldRuleForm.relatedRelationshipIds,
      relatedForeshadowingIds: worldRuleForm.relatedForeshadowingIds,
      relatedTimelineEventIds: worldRuleForm.relatedTimelineEventIds, source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/world-rules/${worldRuleForm.ruleId}`, {
      ...body, reviewStatus: worldRuleForm.reviewStatus,
      locked: worldRuleForm.reviewStatus === 'confirmed' && worldRuleForm.locked, forceUnlock: !worldRuleForm.locked,
    });
    else await api.post(`/projects/${projectId}/continuity/world-rules`, body);
    setNotice(isEditing ? '世界观规则修改已保存。' : '世界观规则已保存为待确认记录，需要确认后才能锁定。');
    setWorldRuleForm(defaultWorldRuleForm); await loadContinuity();
  };
  const patchWorldRule = async (rule: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/world-rules/${rule.id}`, patch); await loadContinuity();
  };
  const saveWorldRuleEvent = async () => {
    if (!worldRuleEventForm.ruleId) return setNotice('请先选择规则。');
    await api.post(`/projects/${projectId}/continuity/world-rules/${worldRuleEventForm.ruleId}/events`, {
      chapterId: focusChapter?.id, eventType: worldRuleEventForm.eventType,
      summary: worldRuleEventForm.summary, evidence: worldRuleEventForm.evidence,
      impact: worldRuleEventForm.impact, source: 'manual',
    });
    setNotice('世界观规则事件已保存为待确认记录。');
    setWorldRuleEventForm(defaultWorldRuleEventForm); await loadContinuity();
  };
  const saveWorldRuleTask = async () => {
    if (!worldRuleTaskForm.ruleId || !worldRuleTaskForm.chapterId) return setNotice('请先选择规则和章节。');
    await api.post(`/projects/${projectId}/continuity/world-rule-tasks`, {
      ruleId: worldRuleTaskForm.ruleId, chapterId: worldRuleTaskForm.chapterId,
      taskType: worldRuleTaskForm.taskType, priority: worldRuleTaskForm.priority,
      instruction: worldRuleTaskForm.instruction, reason: worldRuleTaskForm.reason, source: 'manual',
    });
    setNotice('当前章世界观任务已保存为待确认记录。');
    setWorldRuleTaskForm(defaultWorldRuleTaskForm); await loadContinuity();
  };
  const patchWorldRuleTask = async (task: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/world-rule-tasks/${task.id}`, patch); await loadContinuity();
  };
  const saveTimelineEvent = async () => {
    if (!timelineEventForm.title.trim()) return setNotice('请填写时间线事件标题。');
    const isEditing = Boolean(timelineEventForm.eventId);
    const body = {
      title: timelineEventForm.title, summary: timelineEventForm.summary, lineType: timelineEventForm.lineType,
      chapterId: timelineEventForm.chapterId || undefined, volumeIndex: Number(timelineEventForm.volumeIndex || 1),
      chapterIndex: Number(timelineEventForm.chapterIndex || 1), storyTimeText: timelineEventForm.storyTimeText,
      storyTimeOrder: Number(timelineEventForm.storyTimeOrder || 0), narrativeOrder: Number(timelineEventForm.narrativeOrder || 0),
      causalityOrder: Number(timelineEventForm.causalityOrder || 0), location: timelineEventForm.location,
      participantsCharacterIds: timelineEventForm.participantsCharacterIds,
      relatedRelationshipIds: timelineEventForm.relatedRelationshipIds,
      relatedForeshadowingIds: timelineEventForm.relatedForeshadowingIds,
      relatedWorldRuleIds: timelineEventForm.relatedWorldRuleIds,
      readerKnownState: timelineEventForm.readerKnownState, characterKnownState: timelineEventForm.characterKnownState,
      status: timelineEventForm.status, riskLevel: timelineEventForm.riskLevel, riskReason: timelineEventForm.riskReason, source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/timeline-events/${timelineEventForm.eventId}`, {
      ...body, reviewStatus: timelineEventForm.reviewStatus,
      locked: timelineEventForm.reviewStatus === 'confirmed' && timelineEventForm.locked, forceUnlock: !timelineEventForm.locked,
    });
    else await api.post(`/projects/${projectId}/continuity/timeline-events`, body);
    setNotice(isEditing ? '时间线事件修改已保存。' : '时间线事件已保存为待确认记录，需要确认后才能锁定。');
    setTimelineEventForm(defaultTimelineEventForm); await loadContinuity();
  };
  const patchTimelineEvent = async (event: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/timeline-events/${event.id}`, patch); await loadContinuity();
  };
  const saveTimelineLink = async () => {
    if (!timelineLinkForm.sourceEventId || !timelineLinkForm.targetEventId) return setNotice('请选择源事件和目标事件。');
    if (timelineLinkForm.sourceEventId === timelineLinkForm.targetEventId) return setNotice('源事件和目标事件不能相同。');
    const isEditing = Boolean(timelineLinkForm.linkId);
    const body = {
      sourceEventId: timelineLinkForm.sourceEventId, targetEventId: timelineLinkForm.targetEventId,
      linkType: timelineLinkForm.linkType, summary: timelineLinkForm.summary, evidence: timelineLinkForm.evidence,
      riskLevel: timelineLinkForm.riskLevel, riskReason: timelineLinkForm.riskReason, source: 'manual',
    };
    if (isEditing) await api.patch(`/projects/${projectId}/continuity/timeline-links/${timelineLinkForm.linkId}`, {
      ...body, reviewStatus: timelineLinkForm.reviewStatus,
      locked: timelineLinkForm.reviewStatus === 'confirmed' && timelineLinkForm.locked,
    });
    else await api.post(`/projects/${projectId}/continuity/timeline-links`, body);
    setNotice(isEditing ? '因果链路修改已保存。' : '因果链路已保存为待确认记录，需要确认后才能锁定。');
    setTimelineLinkForm(defaultTimelineLinkForm); await loadContinuity();
  };
  const patchTimelineLink = async (link: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/timeline-links/${link.id}`, patch); await loadContinuity();
  };
  const saveTimelineTask = async () => {
    if (!timelineTaskForm.eventId || !timelineTaskForm.chapterId) return setNotice('请先选择事件和章节。');
    await api.post(`/projects/${projectId}/continuity/timeline-tasks`, {
      eventId: timelineTaskForm.eventId, chapterId: timelineTaskForm.chapterId,
      taskType: timelineTaskForm.taskType, priority: timelineTaskForm.priority,
      instruction: timelineTaskForm.instruction, reason: timelineTaskForm.reason, source: 'manual',
    });
    setNotice('当前章时间线任务已保存为待确认记录。');
    setTimelineTaskForm(defaultTimelineTaskForm); await loadContinuity();
  };
  const patchTimelineTask = async (task: any, patch: Record<string, unknown>) => {
    await api.patch(`/projects/${projectId}/continuity/timeline-tasks/${task.id}`, patch); await loadContinuity();
  };

  if (loading) return <div style={styles.loading}>正在整理全书脉络...</div>;
  if (!projectId) return <div style={styles.loading}>请先选择项目。</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>全书脉络</div>
          <h1 style={styles.title}>全书脉络</h1>
          <p style={styles.subtitle}>围绕当前创作章节查看全貌、人物状态、关系风险、伏笔雷达、世界观规则、时间线三线模型、写作前检查与写作后更新闭环能力。</p>
        </div>
        <button type="button" style={styles.secondaryButton} onClick={() => navigate(`/project/${projectId}/dashboard`)}>返回首页</button>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}
      {continuityLoading && <div style={styles.notice}>正在刷新小说资料...</div>}
      {phase75Loading && <div style={styles.notice}>正在整理本章写作资料...</div>}

      <section style={styles.focusBar}>
        <label style={styles.label}>当前创作章节</label>
        <select value={focusChapterId} onChange={event => setFocusChapterId(event.target.value)} style={styles.select} disabled={!sortedChapters.length}>
          {!sortedChapters.length && <option value="">暂无章节</option>}
          {sortedChapters.map(ch => (
            <option key={ch.id} value={ch.id}>第{volumeIndex(ch)}卷 第{chapterIndex(ch)}章 {ch.title} [{ch.status || 'draft'}]</option>
          ))}
        </select>
        <span style={styles.savedHint}>{sortedChapters.length ? '已记住当前选择，重新打开仍会恢复。' : '当前项目暂无章节，请先创建大纲或章节。'}</span>
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
        relatedForeshadowingTasks: focusForeshadowingTasks,
        relatedWorldTasks: focusWorldTasks,
        relatedWorldRules: focusWorldRules,
        relatedTimelineTasks: focusTimelineTasks,
        relatedTimelineEvents: focusTimelineEvents,
        legacyTimelineEvents: relatedTimelineEvents,
        manualGoal, setManualGoal, manualForbidden, setManualForbidden, manualNotes, setManualNotes,
        manualPrompt, setManualPrompt, visiblePrompt, promptDisabled: !focusChapter, copyStatus, onCopyPrompt: handleCopyPrompt,
      })}
      {activeTab === 'characters' && renderCharactersTab({
        data: continuityCharacters, legacyCharacters, stateForm, setStateForm, saveStateSnapshot, patchStateSnapshot, setNotice,
      })}
      {activeTab === 'relations' && renderRelationsTab({
        data: continuityRelationships, characters: normalizeArray<any>(continuityCharacters?.groups?.allCharacters), relationshipForm, setRelationshipForm,
        relationshipEventForm, setRelationshipEventForm, saveRelationship, saveRelationshipEvent, patchRelationship, setNotice,
      })}
      {activeTab === 'foreshadowing' && renderForeshadowingTab({
        data: continuityForeshadowings,
        chapters: sortedChapters,
        characters: normalizeArray<any>(continuityCharacters?.groups?.allCharacters),
        relationships: normalizeArray<any>(continuityRelationships?.groups?.allRelationships),
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
      {activeTab === 'world' && renderWorldTab({
        data: continuityWorldRules,
        chapters: sortedChapters,
        characters: normalizeArray<any>(continuityCharacters?.groups?.allCharacters),
        relationships: normalizeArray<any>(continuityRelationships?.groups?.allRelationships),
        setNotice,
        worldRuleForm, setWorldRuleForm,
        worldRuleEventForm, setWorldRuleEventForm,
        worldRuleTaskForm, setWorldRuleTaskForm,
        saveWorldRule, patchWorldRule,
        saveWorldRuleEvent, saveWorldRuleTask, patchWorldRuleTask,
      })}
      {activeTab === 'timeline' && renderTimelineTab({
        data: continuityTimeline,
        chapters: sortedChapters,
        characters: normalizeArray<any>(continuityCharacters?.groups?.allCharacters),
        relationships: normalizeArray<any>(continuityRelationships?.groups?.allRelationships),
        setNotice,
        timelineEventForm, setTimelineEventForm,
        timelineLinkForm, setTimelineLinkForm,
        timelineTaskForm, setTimelineTaskForm,
        saveTimelineEvent, patchTimelineEvent,
        saveTimelineLink, patchTimelineLink,
        saveTimelineTask, patchTimelineTask,
      })}
      {activeTab === 'precheck' && renderPrecheckTab({
        data: precheckResult,
        onRun: runPrecheck,
        onCopy: copyPrecheckSummary,
        setActiveTab,
      })}
      {activeTab === 'postupdate' && renderPostupdateTab({
        data: postupdateResult,
        focusChapter,
        onRun: runPostupdate,
        onCopy: copyPostupdateSummary,
        onApply: applyPostupdateSuggestion,
      })}
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
    ['当前章世界观规则', String(input.stats.focusWorldRules)],
    ['当前章世界观任务', String(input.stats.focusWorldTasks)],
    ['世界观冲突', String(input.stats.worldRuleConflicts)],
    ['高风险世界观', String(input.stats.worldRuleHighRisk)],
    ['当前章时间线事件', String(input.stats.focusTimelineEvents)],
    ['当前章时间线任务', String(input.stats.focusTimelineTasks)],
    ['时间冲突', String(input.stats.timeConflicts)],
    ['因果缺口', String(input.stats.causalityGaps)],
    ['时间线风险', String(input.stats.timelineRisks)],
    ['注意力风险', String(input.stats.attentionRisks)],
  ];
  const nextActions = [
    input.stats.worldRuleConflicts ? `存在 ${input.stats.worldRuleConflicts} 个世界观冲突，先解决规则矛盾。` : '',
    input.stats.timeConflicts ? `存在 ${input.stats.timeConflicts} 个时间冲突，先校正客观故事时间。` : '',
    input.stats.causalityGaps ? `存在 ${input.stats.causalityGaps} 个因果缺口，先补足事件因果链。` : '',
    input.stats.worldRuleHighRisk ? `存在 ${input.stats.worldRuleHighRisk} 个高风险世界观规则，写作前先确认不能违背。` : '',
    input.stats.focusWorldTasks ? `当前章有 ${input.stats.focusWorldTasks} 个世界观任务，写正文前先处理。` : '',
    input.stats.focusTimelineTasks ? `当前章有 ${input.stats.focusTimelineTasks} 个时间线任务，写正文前先处理。` : '',
  ].filter(Boolean);
  return (
    <div>
      <div style={styles.notice}>这里汇总人物状态、关系变化、伏笔、世界规则和时间先后，帮助你在动笔前快速发现前后矛盾。</div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={label} value={value} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前创作全貌">
          <Line label="当前主线阶段" value={input.focusChapter ? '围绕当前章节和大纲继续推进。' : EMPTY} />
          <Line label="当前章节标题" value={input.focusChapter?.title || '待选择章节'} />
          <Line label="最近章节" value={input.recentChapters.length ? input.recentChapters.map((ch: any) => ch.title).join(' / ') : EMPTY} />
          <Line label="待作者确认项" value={input.stats.pendingConfirmations ? `${input.stats.pendingConfirmations} 项待确认` : EMPTY} />
        </Panel>
        <Panel title="下一个创作动作">
          <Line label="世界观 / 时间线提醒" value={nextActions.length ? nextActions.join('；') : '暂无本章世界观 / 时间线阻塞提醒。'} />
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
    : '本章尚未记录人物状态，可在人物页或本章写作包中添加。';
  const relationshipNotes = input.relatedRelationships.length
    ? input.relatedRelationships.map((r: any) => `${r.sourceCharacterName} - ${r.targetCharacterName}：${r.publicRelation || EMPTY}，冲突 ${r.conflictScore}`).join('；')
    : '本章尚未涉及明确的人物关系变化。';
  const worldNotes = input.relatedWorldTasks?.length
    ? groupWorldTaskNotes(input.relatedWorldTasks)
    : input.relatedWorldRules?.length
      ? input.relatedWorldRules.map((r: any) => r.title).join('；')
      : '暂无本章额外世界观处理项。';
  const timelineNotes = input.relatedTimelineTasks?.length
    ? groupTimelineTaskNotes(input.relatedTimelineTasks)
    : input.relatedTimelineEvents?.length
      ? input.relatedTimelineEvents.map((e: any) => e.title || e.id).join('；')
      : '暂无本章额外时间线处理项。';
  const foreshadowingNotes = input.relatedForeshadowingTasks?.length
    ? groupTaskNotes(input.relatedForeshadowingTasks)
    : ch && input.relatedForeshadowings.length
      ? input.relatedForeshadowings.map((f: any) => f.content || f.title).join(' / ')
      : '本章尚未安排需要处理的伏笔。';
  const forbiddenBase = [
    ch?.status === 'locked' ? 'locked 章节不可自动修改。' : '',
    '已确认设定不可被当前页面直接覆盖。',
    'AI 生成内容必须进入待确认，不直接写入正式设定库。',
    !goal ? '当前章纲尚未写明章节目标。' : '',
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
          <Line label="世界观注意事项" value={worldNotes} />
          <Line label="时间线注意事项" value={timelineNotes} />
          <Line label="禁止写错事项" value={[...forbiddenBase, input.manualForbidden].filter(Boolean).join('；')} />
        </Panel>
        <Panel title="写作前临时备忘">
          <label style={styles.label}>当前章写作目标</label>
          <textarea value={input.manualGoal} onChange={(e) => input.setManualGoal(e.target.value)} style={styles.textarea} placeholder="仅供本次写作参考，不修改正式大纲。" />
          <label style={styles.label}>禁止写错事项</label>
          <textarea value={input.manualForbidden} onChange={(e) => input.setManualForbidden(e.target.value)} style={styles.textarea} placeholder="每行一条。不会覆盖正式设定库。" />
          <label style={styles.label}>本章备注</label>
          <textarea value={input.manualNotes} onChange={(e) => input.setManualNotes(e.target.value)} style={styles.textarea} />
          <div style={styles.notice}>这里是临时备忘，不属于正式微调。需要同步到各模块时，请在大纲、角色、世界观、伏笔或时间线页面保存修改。</div>
        </Panel>
      </section>
      <Panel title="本章写作准备">
        <textarea value={input.visiblePrompt} onChange={(e) => input.setManualPrompt(e.target.value)} style={{ ...styles.textarea, minHeight: 240 }} disabled={input.promptDisabled} />
        <button type="button" style={styles.copyButton} onClick={input.onCopyPrompt}>
          {input.copyStatus === 'copied' ? '已复制' : input.copyStatus === 'failed' ? '复制失败，请手动复制' : '复制写作要求'}
        </button>
        <div style={styles.notice}>这里汇总本章目标、人物状态、关系、伏笔和时间顺序，可直接用于动笔前回顾。</div>
      </Panel>
    </div>
  );
}

function renderCharactersTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const allCharacters = normalizeArray<any>(groups.allCharacters).length
    ? normalizeArray<any>(groups.allCharacters)
    : normalizeArray<any>(input.legacyCharacters);
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
            <p style={styles.empty}>本章尚未安排出场人物，可从章纲或人物页选择。</p>
          )}
        </Panel>
        <Panel title="本章缺失的人物状态信息">
          <Line label="目标" value={(groups.focusCharacters || []).some((c: any) => c.currentGoal !== EMPTY) ? '已有部分人物目标。' : EMPTY} />
          <Line label="状态摘要" value={(groups.focusCharacters || []).some((c: any) => c.currentStateSummary !== EMPTY) ? '已有部分人物状态。' : EMPTY} />
          <Line label="说话方式" value={(groups.focusCharacters || []).some((c: any) => c.dialogueStyle !== EMPTY) ? '已有部分说话方式。' : EMPTY} />
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
          <div style={styles.notice}>作者修改会先形成变更记录，不直接覆盖已经确认或锁定的设定。</div>
        </Panel>
      </section>
    </div>
  );
}

function renderRelationsTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const allRelationships = normalizeArray<any>(groups.allRelationships);
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
            <p style={styles.empty}>本章尚未记录人物关系变化，可手动添加或在正文完成后更新。</p>
          )}
        </Panel>
        <Panel title="当前章关系注意">
          <Line label="最紧张关系" value={(groups.focusRelationships || []).sort((a: any, b: any) => b.conflictScore - a.conflictScore)[0]?.changeSummary || EMPTY} />
          <Line label="隐藏关系" value={(groups.hiddenRelationships || []).length ? `${groups.hiddenRelationships.length} 条隐藏关系` : EMPTY} />
          <Line label="读者已知" value={(groups.focusRelationships || []).some((r: any) => r.readerKnownState === 'known' && r.sourceKnownState !== 'known') ? '存在读者已知但角色未知的关系。' : EMPTY} />
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
          <div style={styles.notice}>保存后只更新这条人物关系，不会自动编造其他关系。</div>
        </Panel>
      </section>
    </div>
  );
}

function renderForeshadowingTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const allThreads = normalizeArray<any>(groups.allThreads);
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
          <div style={styles.notice}>伏笔雷达同时展示当前伏笔和旧项目伏笔；旧资料保持只读，避免意外改写。</div>
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="伏笔生命周期">
          <Group title="本章必须处理" items={(groups.focusTasks || []).length ? (groups.focusTasks || []) : (groups.focusThreads || [])} render={(item: any) => {
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
      ) : <div style={styles.hint}>旧项目伏笔仅供查看。</div>}
    </details>
  );
}

function ForeshadowingTaskCard({ task, input }: { task: any; input: any }) {
  const isDerived = task.derived || task.source === 'radar_derived';
  const isPersistedTask = !task.legacy && !isDerived;
  return (
    <div style={styles.itemCard}>
      <Line label="关联伏笔" value={task.threadTitle || task.threadId || EMPTY} />
      <Line label="任务" value={`${TASK_TYPE_LABELS[task.taskType] || task.taskType || EMPTY} / ${task.priority || EMPTY} / ${task.status || EMPTY}`} />
      <Line label="写作指令" value={task.instruction || EMPTY} />
      <Line label="原因" value={task.reason || EMPTY} />
      <Line label="审核" value={`${task.reviewStatus || EMPTY}${task.locked ? ' / locked' : ''}${isDerived ? ' / 雷达推导' : ''}`} />
      {isPersistedTask && (
        <div style={styles.inlineActions}>
          {TASK_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchTask(task, { status })}>{status}</button>)}
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchTask(task, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!task.locked && task.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchTask(task, { locked: !task.locked });
          }}>{task.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
      {isDerived && (
        <div style={styles.hint}>雷达推导任务，仅用于当前章提醒；需要持久化请在人工微调区新增当前章任务。</div>
      )}
      {task.legacy && !isPersistedTask && !isDerived && (
        <div style={styles.hint}>旧版伏笔任务只读展示。</div>
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


function renderWorldTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const allRules = normalizeArray<any>(groups.allRules);
  const editableWorldRules = allRules.filter((rule: any) => !rule.legacy && !(rule.derived || rule.source === 'radar_derived'));
  const worldFocusTasks = groups.focusTasks || [];
  const worldFocusRules = groups.focusRules || [];
  const worldMustHandleItems = worldFocusTasks.length ? worldFocusTasks : worldFocusRules;
  const isEditingWorldRule = Boolean(input.worldRuleForm.ruleId);
  const canLockWorldRule = isEditingWorldRule && input.worldRuleForm.reviewStatus === 'confirmed';
  const cards = [
    ['总规则数', summary.totalRules ?? 0],
    ['当前章相关规则', summary.focusRules ?? 0],
    ['当前章规则任务', summary.focusTasks ?? 0],
    ['全书规则', summary.fullBookRules ?? 0],
    ['卷内规则', summary.volumeRules ?? 0],
    ['章节规则', summary.chapterRules ?? 0],
    ['待确认规则', summary.pendingReviewCount ?? 0],
    ['冲突规则', summary.conflictCount ?? 0],
    ['高风险规则', summary.highRiskCount ?? 0],
    ['locked 规则', summary.lockedCount ?? 0],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章节创作辅助区">
          {(groups.focusRules || []).length ? groups.focusRules.map((rule: any) => <WorldRuleCard key={rule.id} rule={rule} input={input} />) : (
            <p style={styles.empty}>本章尚未引用具体世界规则，可从世界观页选择。</p>
          )}
        </Panel>
        <Panel title="世界观创作注意">
          <Line label="本章必须遵守" value={(groups.focusRules || []).filter((r: any) => r.status === 'established' || r.status === 'active').map((r: any) => r.title).join(' / ') || EMPTY} />
          <Line label="本章规则冲突" value={(groups.conflictRules || []).length ? groups.conflictRules.map((r: any) => r.title).join(' / ') : EMPTY} />
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="结构化详情区"> <Group title="本章必须处理" items={worldMustHandleItems} render={(item: any) => {
            if (item.ruleId) return <WorldRuleTaskCard task={item} input={input} />;
            return <WorldRuleCard rule={item} input={input} />;
          }} />
          <Group title="当前章相关规则" items={groups.focusRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="活跃规则" items={groups.activeRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="冲突规则" items={groups.conflictRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="高风险规则" items={groups.highRisk || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="待确认规则" items={groups.pendingReview || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="全书规则" items={groups.fullBookRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="卷内规则" items={groups.volumeRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="章节规则" items={groups.chapterRules || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="最近变化规则" items={groups.changedRecently || []} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
          <Group title="全部规则" items={allRules} render={(rule: any) => <WorldRuleCard rule={rule} input={input} />} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>规则标题</label>
          <input style={styles.input} value={input.worldRuleForm.title} onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, title: e.target.value })} />
          <label style={styles.label}>规则类型</label>
          <select style={styles.selectFull} value={input.worldRuleForm.ruleType} onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, ruleType: e.target.value })}>
            {WORLD_RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={styles.label}>作用范围</label>
          <select style={styles.selectFull} value={input.worldRuleForm.scope} onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, scope: e.target.value })}>
            {WORLD_RULE_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <FormTextarea label="规则内容" value={input.worldRuleForm.content} onChange={(v) => input.setWorldRuleForm({ ...input.worldRuleForm, content: v })} />
          <FormTextarea label="解释" value={input.worldRuleForm.explanation} onChange={(v) => input.setWorldRuleForm({ ...input.worldRuleForm, explanation: v })} />
          <FormTextarea label="限制" value={input.worldRuleForm.limitation} onChange={(v) => input.setWorldRuleForm({ ...input.worldRuleForm, limitation: v })} />
          <FormTextarea label="违背风险" value={input.worldRuleForm.contradictionRisk} onChange={(v) => input.setWorldRuleForm({ ...input.worldRuleForm, contradictionRisk: v })} />
          <label style={styles.label}>风险等级</label>
          <select style={styles.selectFull} value={input.worldRuleForm.riskLevel} onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, riskLevel: e.target.value })}>
            {WORLD_RULE_RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <label style={styles.label}>审核状态</label>
          {input.worldRuleForm.ruleId ? (
            <select style={styles.selectFull} value={input.worldRuleForm.reviewStatus} onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, reviewStatus: e.target.value, locked: e.target.value === 'confirmed' ? input.worldRuleForm.locked : false })}>
              {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <div style={styles.readonlyBox}>新增模式固定 pending。</div>}
          <label style={styles.checkbox}>
            <input type="checkbox" checked={Boolean(input.worldRuleForm.ruleId && input.worldRuleForm.locked)} disabled={!canLockWorldRule}
              onChange={(e) => input.setWorldRuleForm({ ...input.worldRuleForm, locked: e.target.checked })} /> 锁定规则
          </label>
          {!input.canLock && input.worldRuleForm.ruleId && <div style={styles.hint}>先确认后才能锁定。</div>}
          <button type="button" style={styles.primaryButton} onClick={() => input.saveWorldRule()}>{input.worldRuleForm.ruleId ? '保存规则修改' : '新增世界观规则'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setWorldRuleForm(defaultWorldRuleForm)}>清空表单</button>
          <hr style={styles.hr} />
          <label style={styles.label}>新增规则事件</label>
          <select style={styles.selectFull} value={input.worldRuleEventForm.ruleId} onChange={(e) => input.setWorldRuleEventForm({ ...input.worldRuleEventForm, ruleId: e.target.value })}>
            <option value="">选择规则</option>
            {editableWorldRules.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <label style={styles.label}>事件类型</label>
          <select style={styles.selectFull} value={input.worldRuleEventForm.eventType} onChange={(e) => input.setWorldRuleEventForm({ ...input.worldRuleEventForm, eventType: e.target.value })}>
            {WORLD_RULE_EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <FormTextarea label="事件摘要" value={input.worldRuleEventForm.summary} onChange={(v) => input.setWorldRuleEventForm({ ...input.worldRuleEventForm, summary: v })} />
          <FormTextarea label="证据" value={input.worldRuleEventForm.evidence} onChange={(v) => input.setWorldRuleEventForm({ ...input.worldRuleEventForm, evidence: v })} />
          <FormTextarea label="影响" value={input.worldRuleEventForm.impact} onChange={(v) => input.setWorldRuleEventForm({ ...input.worldRuleEventForm, impact: v })} />
          <button type="button" style={styles.primaryButton} onClick={() => input.saveWorldRuleEvent()}>新增规则事件</button>
          <hr style={styles.hr} />
          <label style={styles.label}>新增当前章世界观任务</label>
          <select style={styles.selectFull} value={input.worldRuleTaskForm.ruleId} onChange={(e) => input.setWorldRuleTaskForm({ ...input.worldRuleTaskForm, ruleId: e.target.value })}>
            <option value="">选择规则</option>
            {editableWorldRules.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <label style={styles.label}>任务类型</label>
          <select style={styles.selectFull} value={input.worldRuleTaskForm.taskType} onChange={(e) => input.setWorldRuleTaskForm({ ...input.worldRuleTaskForm, taskType: e.target.value })}>
            {WORLD_RULE_TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <FormTextarea label="写作指令" value={input.worldRuleTaskForm.instruction} onChange={(v) => input.setWorldRuleTaskForm({ ...input.worldRuleTaskForm, instruction: v })} />
          <FormTextarea label="原因" value={input.worldRuleTaskForm.reason} onChange={(v) => input.setWorldRuleTaskForm({ ...input.worldRuleTaskForm, reason: v })} />
          <button type="button" style={styles.primaryButton} onClick={() => input.saveWorldRuleTask()}>新增当前章任务</button>
          <div style={styles.notice}>世界观规则、事件、任务新增内容进入待确认，不直接覆盖已确认设定。</div>
        </Panel>
      </section>
    </div>
  );
}

function WorldRuleCard({ rule, input }: { rule: any; input: any }) {
  const isDerived = rule.derived || rule.source === 'radar_derived';
  const canEdit = !rule.legacy && !isDerived;
  return (
    <details style={styles.itemCard}>
      <summary style={styles.itemSummary}>
        <strong>{rule.title || EMPTY}</strong>
        <span>{rule.ruleType || EMPTY}</span>
        <span>{rule.scope || EMPTY}</span>
        <span>{rule.status || EMPTY}</span>
        <span>{rule.riskLevel || EMPTY}{rule.locked ? ' / locked' : ''}{isDerived ? ' / 雷达推导' : ''}</span>
      </summary>
      <Line label="规则内容" value={rule.content || EMPTY} />
      <Line label="解释" value={rule.explanation || EMPTY} />
      <Line label="限制" value={rule.limitation || EMPTY} />
      <Line label="违背风险" value={rule.contradictionRisk || EMPTY} />
      <Line label="首次建立章节" value={rule.firstEstablishedChapterId || EMPTY} />
      <Line label="最近验证章节" value={rule.lastVerifiedChapterId || EMPTY} />
      <Line label="关联人物" value={(rule.relatedCharacterIds || []).join(' / ') || EMPTY} />
      <Line label="关联关系" value={(rule.relatedRelationshipIds || []).join(' / ') || EMPTY} />
      <Line label="关联伏笔" value={(rule.relatedForeshadowingIds || []).join(' / ') || EMPTY} />
      <Line label="关联时间线事件" value={(rule.relatedTimelineEventIds || []).join(' / ') || EMPTY} />
      <Line label="规则事件" value={(rule.latestEvents || []).length ? rule.latestEvents.map((e: any) => `${e.eventType}:${e.summary || EMPTY}`).join(' / ') : EMPTY} />
      <Line label="来源" value={rule.source || EMPTY} />
      <Line label="更新时间" value={rule.updatedAt || EMPTY} />
      {canEdit && (
        <div style={styles.inlineActions}>
          <button type="button" style={styles.tinyButton} onClick={() => input.setWorldRuleForm({
            ...defaultWorldRuleForm,
            ruleId: rule.id, title: rule.title || '', ruleType: rule.ruleType || 'law',
            scope: rule.scope || 'full_book', volumeIndex: Number(rule.volumeIndex || 1),
            content: rule.content || '', explanation: rule.explanation || '',
            limitation: rule.limitation || '', contradictionRisk: rule.contradictionRisk || '',
            status: rule.status || 'planned', riskLevel: rule.riskLevel || 'none',
            firstEstablishedChapterId: rule.firstEstablishedChapterId || '',
            lastVerifiedChapterId: rule.lastVerifiedChapterId || '',
            relatedCharacterIds: rule.relatedCharacterIds || [],
            relatedRelationshipIds: rule.relatedRelationshipIds || [],
            relatedForeshadowingIds: rule.relatedForeshadowingIds || [],
            relatedTimelineEventIds: rule.relatedTimelineEventIds || [],
            reviewStatus: rule.reviewStatus || 'pending', locked: Boolean(rule.locked),
          })}>编辑</button>
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchWorldRule(rule, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!rule.locked && rule.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchWorldRule(rule, { locked: !rule.locked, forceUnlock: rule.locked });
          }}>{rule.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
      {isDerived && <div style={styles.hint}>雷达推导任务，仅用于当前章提醒；需要持久化请在人工微调区新增当前章任务。</div>}
      {rule.legacy && <div style={styles.hint}>旧项目规则仅供查看。</div>}
    </details>
  );
}

function WorldRuleTaskCard({ task, input }: { task: any; input: any }) {
  const isDerived = task.derived || task.source === 'radar_derived';
  const isPersistedTask = !task.legacy && !isDerived;
  return (
    <div style={styles.itemCard}>
      <Line label="关联规则" value={task.ruleTitle || task.ruleId || EMPTY} />
      <Line label="任务" value={`${task.taskType || EMPTY} / ${task.priority || EMPTY} / ${task.status || EMPTY}`} />
      <Line label="写作指令" value={task.instruction || EMPTY} />
      <Line label="原因" value={task.reason || EMPTY} />
      <Line label="审核" value={`${task.reviewStatus || EMPTY}${task.locked ? ' / locked' : ''}${isDerived ? ' / 雷达推导' : ''}`} />
      {isPersistedTask && (
        <div style={styles.inlineActions}>
          {TASK_STATUSES.map(s => <button key={s} type="button" style={styles.tinyButton} onClick={() => input.patchWorldRuleTask(task, { status: s })}>{s}</button>)}
          {REVIEW_STATUSES.map(s => <button key={s} type="button" style={styles.tinyButton} onClick={() => input.patchWorldRuleTask(task, { reviewStatus: s })}>{s}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!task.locked && task.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchWorldRuleTask(task, { locked: !task.locked });
          }}>{task.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
      {isDerived && <div style={styles.hint}>雷达推导任务，仅用于当前章提醒；需要持久化请在人工微调区新增当前章任务。</div>}
      {task.legacy && <div style={styles.hint}>旧版任务只读展示。</div>}
    </div>
  );
}


function renderTimelineTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const allEvents = normalizeArray<any>(groups.allEvents);
  const editableTimelineEvents = allEvents.filter((event: any) => !event.legacy && !(event.derived || event.source === 'radar_derived'));
  const legacyEvents = groups.legacyTimelineEvents || [];
  const timelineFocusTasks = groups.focusTasks || [];
  const timelineFocusEvents = groups.focusEvents || [];
  const timelineMustHandleItems = timelineFocusTasks.length ? timelineFocusTasks : timelineFocusEvents;
  const isEditingTimelineEvent = Boolean(input.timelineEventForm.eventId);
  const canLockTimelineEvent = isEditingTimelineEvent && input.timelineEventForm.reviewStatus === 'confirmed';
  const cards = [
    ['总事件数', summary.totalEvents ?? 0],
    ['当前章相关事件', summary.focusEvents ?? 0],
    ['当前章时间线任务', summary.focusTasks ?? 0],
    ['客观故事时间', summary.storyTimeEvents ?? 0],
    ['叙事呈现事件', summary.narrativeOrderEvents ?? 0],
    ['因果链事件', summary.causalityEvents ?? 0],
    ['因果链路', summary.causalityLinks ?? 0],
    ['时间冲突', summary.timeConflictCount ?? 0],
    ['因果缺口', summary.causalityGapCount ?? 0],
    ['待确认事件', summary.pendingReviewCount ?? 0],
    ['高风险事件', summary.highRiskCount ?? 0],
    ['locked 事件', summary.lockedCount ?? 0],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章节创作辅助区">
          {(groups.focusEvents || []).length ? groups.focusEvents.map((event: any) => <TimelineEventCard key={event.id} event={event} input={input} />) : (
            <p style={styles.empty}>本章尚未安排时间线事件，可在时间线页添加。</p>
          )}
        </Panel>
        <Panel title="时间线创作注意">
          <Line label="客观故事时间" value={(groups.storyTimeLine || []).slice(0, 3).map((e: any) => e.title).join(' / ') || EMPTY} />
          <Line label="叙事呈现顺序" value={(groups.narrativeOrderLine || []).slice(0, 3).map((e: any) => e.title).join(' / ') || EMPTY} />
          <Line label="时间顺序冲突" value={(groups.timeConflicts || []).length ? groups.timeConflicts.map((e: any) => e.title).join(' / ') : EMPTY} />
          <Line label="因果缺口" value={(groups.causalityGaps || []).length ? `${groups.causalityGaps.length} 个事件缺少因果链` : EMPTY} />
        </Panel>
      </section>
      <section style={styles.detailGrid}>
        <Panel title="结构化详情区 - 三线模型">
          <Group title="本章必须处理" items={timelineMustHandleItems} render={(item: any) => {
            if (item.eventId) return <TimelineTaskCard task={item} input={input} />;
            return <TimelineEventCard event={item} input={input} />;
          }} />
          <Group title="当前章相关事件" items={groups.focusEvents || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="客观故事时间线（第一线）" items={groups.storyTimeLine || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="叙事呈现顺序线（第二线）" items={groups.narrativeOrderLine || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="因果链 / 信息链（第三线）" items={groups.causalityLine || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="时间冲突" items={groups.timeConflicts || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="因果缺口" items={groups.causalityGaps || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="高风险事件" items={groups.highRisk || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="待确认事件" items={groups.pendingReview || []} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="legacy 时间线，只读兼容" items={legacyEvents} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
          <Group title="全部事件" items={allEvents} render={(event: any) => <TimelineEventCard event={event} input={input} />} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>事件标题</label>
          <input style={styles.input} value={input.timelineEventForm.title} onChange={(e) => input.setTimelineEventForm({ ...input.timelineEventForm, title: e.target.value })} />
          <label style={styles.label}>lineType</label>
          <select style={styles.selectFull} value={input.timelineEventForm.lineType} onChange={(e) => input.setTimelineEventForm({ ...input.timelineEventForm, lineType: e.target.value })}>
            {TIMELINE_LINE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <FormTextarea label="事件摘要" value={input.timelineEventForm.summary} onChange={(v) => input.setTimelineEventForm({ ...input.timelineEventForm, summary: v })} />
          <FormTextarea label="客观故事时间" value={input.timelineEventForm.storyTimeText} onChange={(v) => input.setTimelineEventForm({ ...input.timelineEventForm, storyTimeText: v })} />
          <label style={styles.label}>审核状态</label>
          {input.timelineEventForm.eventId ? (
            <select style={styles.selectFull} value={input.timelineEventForm.reviewStatus} onChange={(e) => input.setTimelineEventForm({ ...input.timelineEventForm, reviewStatus: e.target.value, locked: e.target.value === 'confirmed' ? input.timelineEventForm.locked : false })}>
              {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <div style={styles.readonlyBox}>新增模式固定 pending。</div>}
          <label style={styles.checkbox}>
            <input type="checkbox" checked={input.timelineEventForm.eventId && input.timelineEventForm.locked} disabled={!(input.timelineEventForm.eventId && input.timelineEventForm.reviewStatus === 'confirmed')}
              onChange={(e) => input.setTimelineEventForm({ ...input.timelineEventForm, locked: e.target.checked })} /> 锁定事件
          </label>
          <button type="button" style={styles.primaryButton} onClick={() => input.saveTimelineEvent()}>{input.timelineEventForm.eventId ? '保存事件修改' : '新增时间线事件'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setTimelineEventForm(defaultTimelineEventForm)}>清空表单</button>
          <hr style={styles.hr} />
          <label style={styles.label}>新增因果链路</label>
          <select style={styles.selectFull} value={input.timelineLinkForm.sourceEventId} onChange={(e) => input.setTimelineLinkForm({ ...input.timelineLinkForm, sourceEventId: e.target.value })}>
            <option value="">选择源事件</option>
            {editableTimelineEvents.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <select style={styles.selectFull} value={input.timelineLinkForm.targetEventId} onChange={(e) => input.setTimelineLinkForm({ ...input.timelineLinkForm, targetEventId: e.target.value })}>
            <option value="">选择目标事件</option>
            {editableTimelineEvents.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <label style={styles.label}>链路类型</label>
          <select style={styles.selectFull} value={input.timelineLinkForm.linkType} onChange={(e) => input.setTimelineLinkForm({ ...input.timelineLinkForm, linkType: e.target.value })}>
            {TIMELINE_LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <FormTextarea label="摘要" value={input.timelineLinkForm.summary} onChange={(v) => input.setTimelineLinkForm({ ...input.timelineLinkForm, summary: v })} />
          <button type="button" style={styles.primaryButton} onClick={() => input.saveTimelineLink()}>{input.timelineLinkForm.linkId ? '保存链路修改' : '新增因果链路'}</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setTimelineLinkForm(defaultTimelineLinkForm)}>清空表单</button>
          <hr style={styles.hr} />
          <label style={styles.label}>新增当前章时间线任务</label>
          <select style={styles.selectFull} value={input.timelineTaskForm.eventId} onChange={(e) => input.setTimelineTaskForm({ ...input.timelineTaskForm, eventId: e.target.value })}>
            <option value="">选择事件</option>
            {editableTimelineEvents.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <label style={styles.label}>任务类型</label>
          <select style={styles.selectFull} value={input.timelineTaskForm.taskType} onChange={(e) => input.setTimelineTaskForm({ ...input.timelineTaskForm, taskType: e.target.value })}>
            {TIMELINE_TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <FormTextarea label="写作指令" value={input.timelineTaskForm.instruction} onChange={(v) => input.setTimelineTaskForm({ ...input.timelineTaskForm, instruction: v })} />
          <FormTextarea label="原因" value={input.timelineTaskForm.reason} onChange={(v) => input.setTimelineTaskForm({ ...input.timelineTaskForm, reason: v })} />
          <button type="button" style={styles.primaryButton} onClick={() => input.saveTimelineTask()}>新增当前章任务</button>
          <div style={styles.notice}>时间线事件、因果链路、任务新增内容进入待确认，不直接覆盖已确认设定。</div>
        </Panel>
      </section>
    </div>
  );
}

function TimelineEventCard({ event, input }: { event: any; input: any }) {
  const isDerived = event.derived || event.source === 'radar_derived';
  const isLegacy = event.legacy;
  const canEdit = !isLegacy && !isDerived;
  return (
    <details style={styles.itemCard}>
      <summary style={styles.itemSummary}>
        <strong>{event.title || EMPTY}</strong>
        <span>{event.lineType || EMPTY}</span>
        <span>{event.status || EMPTY}</span>
        <span>{event.riskLevel || EMPTY}{event.locked ? ' / locked' : ''}{isDerived ? ' / 雷达推导' : ''}{isLegacy ? ' / legacy' : ''}</span>
      </summary>
      <Line label="事件摘要" value={event.summary || EMPTY} />
      <Line label="lineType" value={event.lineType || EMPTY} />
      <Line label="所属章节" value={event.chapterId || EMPTY} />
      <Line label="客观故事时间" value={event.storyTimeText || EMPTY} />
      <Line label="故事时间顺序" value={String(event.storyTimeOrder ?? '')} />
      <Line label="叙事呈现顺序" value={String(event.narrativeOrder ?? '')} />
      <Line label="因果顺序" value={String(event.causalityOrder ?? '')} />
      <Line label="地点" value={event.location || EMPTY} />
      <Line label="参与人物" value={(event.participants || []).map((p: any) => p.name || p.id).join(' / ') || EMPTY} />
      <Line label="关联关系" value={(event.relatedRelationshipIds || []).join(' / ') || EMPTY} />
      <Line label="关联伏笔" value={(event.relatedForeshadowingIds || []).join(' / ') || EMPTY} />
      <Line label="关联世界观规则" value={(event.relatedWorldRuleIds || []).join(' / ') || EMPTY} />
      <Line label="读者已知状态" value={event.readerKnownState || EMPTY} />
      <Line label="角色已知状态" value={event.characterKnownState || EMPTY} />
      <Line label="前因链路" value={(event.incomingLinks || []).length ? event.incomingLinks.map((l: any) => `${l.linkType}:${l.summary || EMPTY}`).join(' / ') : EMPTY} />
      <Line label="后果链路" value={(event.outgoingLinks || []).length ? event.outgoingLinks.map((l: any) => `${l.linkType}:${l.summary || EMPTY}`).join(' / ') : EMPTY} />
      <Line label="来源" value={event.source || EMPTY} />
      <Line label="更新时间" value={event.updatedAt || EMPTY} />
      {canEdit && (
        <div style={styles.inlineActions}>
          <button type="button" style={styles.tinyButton} onClick={() => input.setTimelineEventForm({
            ...defaultTimelineEventForm,
            eventId: event.id, title: event.title || '', summary: event.summary || '',
            lineType: event.lineType || 'story_time', chapterId: event.chapterId || '',
            volumeIndex: Number(event.volumeIndex || 1), chapterIndex: Number(event.chapterIndex || 1),
            storyTimeText: event.storyTimeText || '', storyTimeOrder: Number(event.storyTimeOrder || 0),
            narrativeOrder: Number(event.narrativeOrder || 0), causalityOrder: Number(event.causalityOrder || 0),
            location: event.location || '', participantsCharacterIds: event.participantsCharacterIds || [],
            relatedRelationshipIds: event.relatedRelationshipIds || [],
            relatedForeshadowingIds: event.relatedForeshadowingIds || [],
            relatedWorldRuleIds: event.relatedWorldRuleIds || [],
            readerKnownState: event.readerKnownState || 'unknown',
            characterKnownState: event.characterKnownState || 'unknown',
            status: event.status || 'planned', riskLevel: event.riskLevel || 'none',
            riskReason: event.riskReason || '', reviewStatus: event.reviewStatus || 'pending',
            locked: Boolean(event.locked),
          })}>编辑</button>
          {REVIEW_STATUSES.map(status => <button key={status} type="button" style={styles.tinyButton} onClick={() => input.patchTimelineEvent(event, { reviewStatus: status })}>{status}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!event.locked && event.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchTimelineEvent(event, { locked: !event.locked, forceUnlock: event.locked });
          }}>{event.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
      {isDerived && <div style={styles.hint}>雷达推导任务，仅用于当前章提醒；需要持久化请在人工微调区新增当前章任务。</div>}
      {isLegacy && <div style={styles.hint}>旧项目时间线事件仅供查看。</div>}
    </details>
  );
}

function TimelineTaskCard({ task, input }: { task: any; input: any }) {
  const isDerived = task.derived || task.source === 'radar_derived';
  const isPersistedTask = !task.legacy && !isDerived;
  return (
    <div style={styles.itemCard}>
      <Line label="关联事件" value={task.eventTitle || task.eventId || EMPTY} />
      <Line label="任务" value={`${task.taskType || EMPTY} / ${task.priority || EMPTY} / ${task.status || EMPTY}`} />
      <Line label="写作指令" value={task.instruction || EMPTY} />
      <Line label="原因" value={task.reason || EMPTY} />
      <Line label="审核" value={`${task.reviewStatus || EMPTY}${task.locked ? ' / locked' : ''}${isDerived ? ' / 雷达推导' : ''}`} />
      {isPersistedTask && (
        <div style={styles.inlineActions}>
          {TASK_STATUSES.map(s => <button key={s} type="button" style={styles.tinyButton} onClick={() => input.patchTimelineTask(task, { status: s })}>{s}</button>)}
          {REVIEW_STATUSES.map(s => <button key={s} type="button" style={styles.tinyButton} onClick={() => input.patchTimelineTask(task, { reviewStatus: s })}>{s}</button>)}
          <button type="button" style={styles.tinyButton} onClick={() => {
            if (!task.locked && task.reviewStatus !== 'confirmed') return input.setNotice('先确认后才能锁定。');
            return input.patchTimelineTask(task, { locked: !task.locked });
          }}>{task.locked ? '解锁' : '锁定'}</button>
        </div>
      )}
      {isDerived && <div style={styles.hint}>雷达推导任务，仅用于当前章提醒；需要持久化请在人工微调区新增当前章任务。</div>}
      {task.legacy && <div style={styles.hint}>旧版任务只读展示。</div>}
    </div>
  );
}

function renderPrecheckTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const conclusion = summary.riskLevel === 'blocked'
    ? '不建议直接写正文：请先处理阻塞项。'
    : summary.riskLevel === 'warning'
      ? '可以写，但需要带着提醒写。'
      : '可以开始写作。';
  const cards = [
    ['风险等级', summary.riskLevel || EMPTY],
    ['检查分数', String(summary.score ?? 0)],
    ['阻塞项', String(summary.blockCount ?? 0)],
    ['警告项', String(summary.warningCount ?? 0)],
    ['通过项', String(summary.passCount ?? 0)],
    ['建议开始写作', summary.canStartWriting ? '是' : '否'],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章检查结论">
          <Line label="结论" value={conclusion} />
          <Line label="待确认设定" value={`${summary.pendingCount ?? 0} 项`} />
          <Line label="当前章节" value={data.focusChapter?.title || '待选择章节'} />
        </Panel>
        <Panel title="操作区">
          <button type="button" style={styles.primaryButton} onClick={input.onRun}>重新运行检查</button>
          <button type="button" style={styles.secondaryButton} onClick={input.onCopy}>复制检查结果</button>
          <button type="button" style={styles.secondaryButton} onClick={() => input.setActiveTab('focus')}>跳转当前章焦点</button>
          <div style={styles.inlineActions}>
            {[
              ['characters', '人物'], ['relations', '关系'], ['foreshadowing', '伏笔'], ['world', '世界观'], ['timeline', '时间线'],
            ].map(([key, label]) => <button key={key} type="button" style={styles.tinyButton} onClick={() => input.setActiveTab(key)}>{label}</button>)}
          </div>
        </Panel>
      </section>
      <Panel title="结构化详情区">
        <CheckGroup title="阻塞项" items={groups.blockers || []} />
        <CheckGroup title="警告项" items={groups.warnings || []} />
        <CheckGroup title="通过项" items={groups.passes || []} />
        <CheckGroup title="建议项" items={groups.suggestions || []} />
      </Panel>
    </div>
  );
}

function renderPostupdateTab(input: any) {
  const data = input.data || {};
  const summary = data.summary || {};
  const groups = normalizeGroups(data.groups);
  const ch = input.focusChapter || data.focusChapter;
  const cards = [
    ['更新建议', String(summary.suggestionCount ?? 0)],
    ['冲突数', String(summary.conflictCount ?? 0)],
    ['locked 冲突', String(summary.lockedConflictCount ?? 0)],
    ['pending 数', String(summary.pendingCount ?? 0)],
    ['可安全生成待确认项', summary.canApplySafely ? '是' : '否'],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>{cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={String(value)} />)}</section>
      <section style={styles.twoColumns}>
        <Panel title="当前章正文状态">
          <Line label="当前章节" value={ch?.title || '待选择章节'} />
          <Line label="字数" value={`${wordCount(ch)} 字`} />
          <Line label="是否有正文" value={String(ch?.content || '').trim() ? '是' : '否'} />
          <Line label="是否 locked" value={ch?.status === 'locked' ? '是' : '否'} />
        </Panel>
        <Panel title="操作区">
          <button type="button" style={styles.primaryButton} onClick={input.onRun}>运行写作后更新分析</button>
          <button type="button" style={styles.secondaryButton} onClick={input.onCopy}>复制更新摘要</button>
          <div style={styles.notice}>确认生成也只会写入 pending 待确认项；locked / confirmed 设定不会被自动覆盖。</div>
        </Panel>
      </section>
      <Panel title="结构化详情区">
        <SuggestionGroup title="人物状态更新建议" items={groups.characterUpdates || []} input={input} />
        <SuggestionGroup title="人物关系更新建议" items={groups.relationshipUpdates || []} input={input} />
        <SuggestionGroup title="伏笔更新建议" items={groups.foreshadowingUpdates || []} input={input} />
        <SuggestionGroup title="世界观规则更新建议" items={groups.worldRuleUpdates || []} input={input} />
        <SuggestionGroup title="时间线更新建议" items={groups.timelineUpdates || []} input={input} />
        <SuggestionGroup title="冲突建议" items={groups.conflicts || []} input={input} />
        <SuggestionGroup title="已忽略建议" items={groups.ignored || []} input={input} />
      </Panel>
    </div>
  );
}

function CheckGroup({ title, items }: { title: string; items: any[] }) {
  const safeItems = normalizeArray<any>(items);
  return (
    <div style={styles.group}>
      <h3 style={styles.groupTitle}>{title}</h3>
      {safeItems.length ? safeItems.map(item => (
        <div key={item.id} style={styles.itemCard}>
          <Line label={item.title || EMPTY} value={item.detail || EMPTY} />
          <Line label="模块 / 级别" value={`${item.module || EMPTY} / ${item.level || EMPTY}`} />
          <Line label="操作建议" value={item.actionHint || EMPTY} />
        </div>
      )) : <p style={styles.empty}>暂无数据。</p>}
    </div>
  );
}

function SuggestionGroup({ title, items, input }: { title: string; items: any[]; input: any }) {
  const safeItems = normalizeArray<any>(items);
  return (
    <div style={styles.group}>
      <h3 style={styles.groupTitle}>{title}</h3>
      {safeItems.length ? safeItems.map(item => (
        <div key={item.id} style={styles.itemCard}>
          <Line label={item.title || EMPTY} value={item.summary || EMPTY} />
          <Line label="目标 / 动作" value={`${item.targetType || EMPTY} / ${item.actionType || EMPTY}`} />
          <Line label="风险 / 状态" value={`${item.riskLevel || EMPTY} / ${item.reviewStatus || EMPTY}${item.lockedConflict ? ' / locked conflict' : ''}`} />
          <Line label="证据片段" value={item.evidence || EMPTY} />
          <div style={styles.inlineActions}>
            <button type="button" style={styles.tinyButton} onClick={() => input.onApply(item, 'confirm')}>生成待确认项</button>
            <button type="button" style={styles.tinyButton} onClick={() => input.onApply(item, 'ignore')}>忽略</button>
            <button type="button" style={styles.tinyButton} onClick={() => input.onApply(item, 'conflict')}>标记冲突</button>
          </div>
        </div>
      )) : <p style={styles.empty}>暂无数据。</p>}
    </div>
  );
}

function Group({ title, items, render }: { title: string; items: any[]; render: (item: any) => React.ReactNode }) {
  const safeItems = normalizeArray<any>(items);
  return (
    <div style={styles.group}>
      <h3 style={styles.groupTitle}>{title}</h3>
      {safeItems.length ? safeItems.map((item) => <React.Fragment key={item.id}>{render(item)}</React.Fragment>) : <p style={styles.empty}>暂无数据。</p>}
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
        <option value="">不选择</option>
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
  return normalizeArray<any>(items).flatMap(item => [item, ...flattenOutlines(normalizeArray<any>(item?.children))]);
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
  return normalizeArray<any>(characters).filter(c => c.name && text.includes(c.name)).slice(0, 8);
}

function findRelatedForeshadowings(items: any[], chapter: Chapter | null, index: number) {
  if (!chapter) return [];
  return normalizeArray<any>(items).filter(item => {
    const buried = Number(item.buriedChapterIndex ?? item.buried_chapter_index ?? -1);
    const recover = Number(item.plannedRecoveryChapterIndex ?? item.planned_recovery_chapter_index ?? -1);
    return buried === index || recover === index || recover > 0 && recover <= index + 2;
  }).slice(0, 8);
}

function findRelatedTimelineEvents(events: any[], chapter: Chapter | null) {
  if (!chapter) return [];
  return normalizeArray<any>(events).filter(event => {
    const ids = normalizeArray<any>(event.relatedChapterIds || event.related_chapter_ids);
    return Array.isArray(ids) ? ids.includes(chapter.id) : stringifySearchable(ids).includes(chapter.id);
  }).slice(0, 8);
}

const WORLD_TASK_LABELS: Record<string, string> = {
  apply: '本章必须遵守', check: '本章需要检查', reveal: '本章可能暴露',
  avoid_contradiction: '本章避免矛盾', update_rule: '本章规则需更新', verify: '本章需要验证',
};

const TIMELINE_TASK_LABELS: Record<string, string> = {
  place_event: '当前章客观时间位置', check_order: '叙事顺序检查', check_causality: '因果链检查',
  reveal_information: '信息差/信息揭示', avoid_time_conflict: '避免时间冲突', sync_lines: '同步三线模型',
};

function groupWorldTaskNotes(tasks: any[]): string {
  const grouped = tasks.reduce((acc: Record<string, string[]>, task: any) => {
    const key = task.taskType || 'check';
    acc[key] = acc[key] || [];
    acc[key].push(`${task.ruleTitle || task.ruleId || EMPTY}: ${task.instruction || task.reason || EMPTY}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([type, items]) => `${WORLD_TASK_LABELS[type] || type}: ${items.join(' / ')}`).join(' | ');
}

function groupTimelineTaskNotes(tasks: any[]): string {
  const grouped = tasks.reduce((acc: Record<string, string[]>, task: any) => {
    const key = task.taskType || 'check_order';
    acc[key] = acc[key] || [];
    acc[key].push(`${task.eventTitle || task.eventId || EMPTY}: ${task.instruction || task.reason || EMPTY}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([type, items]) => `${TIMELINE_TASK_LABELS[type] || type}: ${items.join(' / ')}`).join(' | ');
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
    `世界观注意事项：${input.focusWorldTasks?.length ? groupWorldTaskNotes(input.focusWorldTasks) : input.focusWorldRules?.length ? input.focusWorldRules.map((r: any) => `${r.title || EMPTY}：${r.content || r.explanation || EMPTY}`).join('；') : EMPTY}`,
    `时间线注意事项：${input.focusTimelineTasks?.length ? groupTimelineTaskNotes(input.focusTimelineTasks) : input.focusTimelineEvents?.length ? input.focusTimelineEvents.map((e: any) => `${e.title || EMPTY}（${e.lineType || EMPTY}）：${e.storyTimeText || e.summary || EMPTY}`).join('；') : EMPTY}`,
    '冲突设计：尚未写入章纲。',
    '爽点 / 压迫点：尚未写入章纲。',
    '结尾钩子：尚未写入章纲。',
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

function formatPrecheckResult(data: any) {
  const summary = data?.summary || {};
  const groups = normalizeGroups(data?.groups);
  const lines = [
    `写作前检查：${data?.focusChapter?.title || '待选择章节'}`,
    `风险等级：${summary.riskLevel || EMPTY}`,
    `分数：${summary.score ?? 0}`,
    `阻塞/警告/通过：${summary.blockCount ?? 0}/${summary.warningCount ?? 0}/${summary.passCount ?? 0}`,
    `建议开始写作：${summary.canStartWriting ? '是' : '否'}`,
  ];
  for (const [label, items] of Object.entries({ 阻塞项: groups.blockers || [], 警告项: groups.warnings || [], 通过项: groups.passes || [], 建议项: groups.suggestions || [] })) {
    lines.push(`\n${label}`);
    (items as any[]).forEach(item => lines.push(`- [${item.module}/${item.level}] ${item.title}: ${item.detail}`));
  }
  return lines.join('\n');
}

function formatPostupdateResult(data: any) {
  const summary = data?.summary || {};
  const groups = normalizeGroups(data?.groups);
  const lines = [
    `写作后更新：${data?.focusChapter?.title || '待选择章节'}`,
    `建议/冲突/pending/locked冲突：${summary.suggestionCount ?? 0}/${summary.conflictCount ?? 0}/${summary.pendingCount ?? 0}/${summary.lockedConflictCount ?? 0}`,
    `可安全生成待确认项：${summary.canApplySafely ? '是' : '否'}`,
  ];
  for (const [label, items] of Object.entries({
    人物状态: groups.characterUpdates || [],
    人物关系: groups.relationshipUpdates || [],
    伏笔: groups.foreshadowingUpdates || [],
    世界观: groups.worldRuleUpdates || [],
    时间线: groups.timelineUpdates || [],
    冲突: groups.conflicts || [],
  })) {
    lines.push(`\n${label}`);
    (items as any[]).forEach(item => lines.push(`- [${item.targetType}/${item.reviewStatus}] ${item.title}: ${item.summary}`));
  }
  return lines.join('\n');
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
