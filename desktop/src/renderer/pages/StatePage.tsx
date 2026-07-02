/**
 * StatePage - 状态仪表盘页面
 * 
 * 根据 RAG 状态管理规范第 6、7、8 节实现
 * 路由：/projects/:id/state
 * 
 * 功能：
 * 1. 显示所有状态卡片（世界观、人物状态、伏笔状态、情节进展）
 * 2. 提供一键提取按钮
 * 3. 支持字段级锁定
 * 4. 支持版本历史查看和回滚
 * 5. 显示一致性检查结果
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

// ============================================================
// 类型定义（根据规范 2.2 节）
// ============================================================

interface CharacterState {
  characterId: string;
  projectId: string;
  snapshotId: string;
  chapterId?: string;
  timestamp: string;
  states: Record<string, any>;
  changedDimensions: string[];
  changeSummary?: string;
  confidence: number;
  needsReview: boolean;
  manuallyModified: boolean;
  modifiedFields: string[];
  history?: Array<{
    version: number;
    data: Record<string, any>;
    source: string;
    createdAt: string;
    changeLog?: string;
  }>;
}

interface ForeshadowingState {
  foreshadowingId: string;
  projectId: string;
  status: 'planted' | 'active' | 'recovered' | 'abandoned';
  plantedChapter?: number;
  recoveredChapter?: number;
  recoveryMethod?: string;
  activeChapters?: number;
  tensionContribution?: number;
  relatedCharacters?: string[];
  relatedChapters?: number[];
  detectedAutomatically?: boolean;
  needsReview?: boolean;
  lastMentionedChapter?: number;
  mentionCount?: number;
}

interface PlotProgress {
  id: string;
  projectId: string;
  chapterIndex: number;
  activeConflicts: Array<{ description: string; status: string; relatedCharacters: string[] }>;
  resolvedConflicts: Array<{ description: string; status: string; relatedCharacters: string[] }>;
  mainGoalProgress: number;
  subGoalProgress: Record<string, number>;
  emotionalBeat: 'calm' | 'rising' | 'climax' | 'falling' | 'trough';
  emotionalIntensity: number;
  pacingScore: number;
  turningPoints: string[];
  needsReview?: boolean;
}

interface ConsistencyCheck {
  id: string;
  checkType: 'character' | 'world_setting' | 'timeline' | 'plot_logic';
  status: 'pass' | 'warning' | 'error';
  message: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  chapterIndex?: number;
  details: Array<{
    field: string;
    expected: string;
    actual: string;
    suggestion?: string;
  }>;
  resolved: boolean;
}

interface StateConfirmation {
  id: string;
  projectId: string;
  sourceChapterId?: string;
  targetType: 'world_setting' | 'character' | 'organization' | 'timeline_state' | 'outline' | 'foreshadowing' | string;
  targetId?: string;
  targetLabel: string;
  summary: string;
  payload: Record<string, any>;
  status: 'pending' | 'confirmed' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
}

interface ChapterListItem {
  id: string;
  volumeIndex?: number;
  chapterIndex?: number;
  title?: string;
}

interface BindingCandidate {
  type: string;
  id: string;
  label: string;
}

// ============================================================
// Tab 定义
// ============================================================

const BASE_TABS = [
  { key: 'overview', label: '总览' },
  { key: 'world', label: '世界观状态' },
  { key: 'character', label: '人物状态' },
  { key: 'organization', label: '组织状态' },
  { key: 'outline', label: '大纲状态' },
  { key: 'foreshadowing', label: '伏笔状态' },
  { key: 'plot', label: '情节进展' },
  { key: 'consistency', label: '一致性检查' },
];

const reviewBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 6px',
  borderRadius: '999px',
  backgroundColor: 'rgba(46,204,113,0.12)',
  border: '1px solid rgba(46,204,113,0.22)',
  color: '#7de8a3',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const apiPayload = (response: any) => response?.data ?? response ?? {};

const getPendingReviewCounts = (
  confirmations: StateConfirmation[],
  consistencyChecks: ConsistencyCheck[],
) => {
  const character = confirmations.filter(c => c.targetType === 'character').length;
  const foreshadowing = confirmations.filter(c => c.targetType === 'foreshadowing').length;
  const plot = confirmations.filter(c => c.targetType === 'timeline_state' || c.targetType === 'plot').length;
  const world = confirmations.filter(c => c.targetType === 'world_setting').length;
  const organization = confirmations.filter(c => c.targetType === 'organization').length;
  const outline = confirmations.filter(c => c.targetType === 'outline').length;
  const consistency = consistencyChecks.filter(c => !c.resolved && (c.status === 'warning' || c.status === 'error')).length;
  return {
    world,
    character,
    organization,
    foreshadowing,
    plot,
    outline,
    consistency,
    total: world + character + organization + foreshadowing + plot + outline + consistency,
  };
};

// ============================================================
// 主组件
// ============================================================

const StatePage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // 数据状态
  const [characterStates, setCharacterStates] = useState<CharacterState[]>([]);
  const [foreshadowingStates, setForeshadowingStates] = useState<ForeshadowingState[]>([]);
  const [plotProgress, setPlotProgress] = useState<PlotProgress[]>([]);
  const [consistencyChecks, setConsistencyChecks] = useState<ConsistencyCheck[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<StateConfirmation[]>([]);
  const [processedConfirmations, setProcessedConfirmations] = useState<StateConfirmation[]>([]);
  const [chapterMap, setChapterMap] = useState<Record<string, ChapterListItem>>({});

  const pendingCounts = getPendingReviewCounts(pendingConfirmations, consistencyChecks);

  // 加载所有状态数据
  const loadAllData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // 并行加载所有状态
      const [characterRes, foreshadowingRes, plotRes, consistencyRes, confirmationRes, confirmationHistoryRes, chapterRes] = await Promise.all([
        api.get(`/projects/${projectId}/state/character`),
        api.get(`/projects/${projectId}/state/foreshadowing`),
        api.get(`/projects/${projectId}/state/plot`),
        api.get(`/projects/${projectId}/state/consistency`),
        api.get(`/projects/${projectId}/state/confirmations?status=pending`),
        api.get(`/projects/${projectId}/state/confirmations?status=all&limit=50`),
        api.get<ChapterListItem[]>(`/projects/${projectId}/chapters`).catch(() => ({ data: [] })),
      ]);

      const confirmationHistory = (apiPayload(confirmationHistoryRes) as any).confirmations || [];
      const chapters = (apiPayload(chapterRes) as any[] | { data?: any[] });
      const chapterList: ChapterListItem[] = Array.isArray(chapters)
        ? chapters
        : Array.isArray((chapters as any).data) ? (chapters as any).data : [];
      setCharacterStates((apiPayload(characterRes) as any).characters || []);
      setForeshadowingStates((apiPayload(foreshadowingRes) as any).foreshadowings || []);
      setPlotProgress((apiPayload(plotRes) as any).plotProgress || []);
      setConsistencyChecks((apiPayload(consistencyRes) as any).checks || []);
      setPendingConfirmations((apiPayload(confirmationRes) as any).confirmations || []);
      setProcessedConfirmations(confirmationHistory.filter((item: StateConfirmation) => item.status !== 'pending').slice(0, 12));
      setChapterMap(chapterList.reduce<Record<string, ChapterListItem>>((map, chapter) => {
        map[chapter.id] = chapter;
        return map;
      }, {}));
    } catch (error) {
      console.error('加载状态数据失败:', error);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 触发状态提取
  const handleExtract = async () => {
    if (!projectId) return;
    setExtracting(true);
    try {
      await api.post(`/projects/${projectId}/state/extract`, {
        stateTypes: ['character', 'foreshadowing', 'plot'],
        force: false,
      });
      alert('✅ 状态提取成功！');
      await loadAllData();
    } catch (error) {
      console.error('状态提取失败:', error);
      alert('❌ 状态提取失败，请重试');
    }
    setExtracting(false);
  };

  // 触发一致性检查
  const handleConsistencyCheck = async () => {
    if (!projectId) return;
    try {
      await api.post(`/projects/${projectId}/state/consistency/check`, {
        checkTypes: ['character', 'world_setting', 'timeline', 'plot_logic'],
      });
      alert('✅ 一致性检查完成！');
      await loadAllData();
    } catch (error) {
      console.error('一致性检查失败:', error);
      alert('❌ 一致性检查失败，请重试');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80' }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* 顶部标题栏 */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>
              状态仪表盘
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6c6c80' }}>
              最后更新: {new Date().toLocaleString()} · AI提取状态需带确稿后进入RAG上下文
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(46,204,113,0.08)',
                border: '1px solid rgba(46,204,113,0.22)',
                borderRadius: '6px',
                color: '#7de8a3',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'default',
                fontFamily: 'inherit',
              }}
            >
              自动提取待确稿状态
            </button>
            <button
              onClick={loadAllData}
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: '#c0c0d0',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              刷新状态
            </button>
            <button
              onClick={handleConsistencyCheck}
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(52,152,219,0.1)',
                border: '1px solid rgba(52,152,219,0.3)',
                borderRadius: '6px',
                color: '#3498db',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              🔍 一致性检查
            </button>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div style={{
        display: 'flex',
        padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}>
        {BASE_TABS.map((tab) => {
          const pending =
            tab.key === 'world' ? pendingCounts.world :
            tab.key === 'character' ? pendingCounts.character :
            tab.key === 'organization' ? pendingCounts.organization :
            tab.key === 'outline' ? pendingCounts.outline :
            tab.key === 'foreshadowing' ? pendingCounts.foreshadowing :
            tab.key === 'plot' ? pendingCounts.plot :
            tab.key === 'consistency' ? pendingCounts.consistency : pendingCounts.total;
          return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #e94560' : '2px solid transparent',
              color: activeTab === tab.key ? '#eaeaea' : '#6c6c80',
              fontSize: '13px',
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {tab.label}
              {pending > 0 && <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>{pending}待确稿</span>}
              {tab.key !== 'overview' && <span style={reviewBadgeStyle}>带确稿</span>}
            </span>
          </button>
        );
        })}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="max-w-6xl mx-auto">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 14px',
            marginBottom: '14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(46,204,113,0.06)',
            border: '1px solid rgba(46,204,113,0.16)',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#eaeaea', marginBottom: '3px' }}>
                统一状态确稿规则
              </div>
              <div style={{ fontSize: '11px', color: '#8a8aa0', lineHeight: 1.55 }}>
                AI正文生成后提取的人物、伏笔、情节和时间线变化，先作为待确稿状态；作者确认后才写入后续RAG检索，避免前后文对不上。
              </div>
            </div>
            <span style={reviewBadgeStyle}>带确稿</span>
          </div>
          {activeTab === 'overview' && (
            <OverviewTab
              characterStates={characterStates}
              foreshadowingStates={foreshadowingStates}
              plotProgress={plotProgress}
              consistencyChecks={consistencyChecks}
              pendingCounts={pendingCounts}
              pendingConfirmations={pendingConfirmations}
              processedConfirmations={processedConfirmations}
              chapterMap={chapterMap}
              onRefresh={loadAllData}
            />
          )}
          {activeTab === 'world' && (
            <ConfirmationInboxTab
              title="世界观待确稿"
              emptyText="暂无世界观待确稿"
              confirmations={pendingConfirmations.filter(c => c.targetType === 'world_setting')}
              onRefresh={loadAllData}
            />
          )}
          {activeTab === 'character' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ConfirmationInboxTab
                title="人物待确稿"
                emptyText="暂无人物待确稿"
                confirmations={pendingConfirmations.filter(c => c.targetType === 'character')}
                onRefresh={loadAllData}
              />
              <CharacterTab
                projectId={projectId}
                characterStates={characterStates}
                onRefresh={loadAllData}
              />
            </div>
          )}
          {activeTab === 'organization' && (
            <ConfirmationInboxTab
              title="组织待确稿"
              emptyText="暂无组织待确稿"
              confirmations={pendingConfirmations.filter(c => c.targetType === 'organization')}
              onRefresh={loadAllData}
            />
          )}
          {activeTab === 'outline' && (
            <ConfirmationInboxTab
              title="大纲待确稿"
              emptyText="暂无大纲待确稿"
              confirmations={pendingConfirmations.filter(c => c.targetType === 'outline')}
              onRefresh={loadAllData}
            />
          )}
          {activeTab === 'foreshadowing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ConfirmationInboxTab
                title="伏笔待确稿"
                emptyText="暂无伏笔待确稿"
                confirmations={pendingConfirmations.filter(c => c.targetType === 'foreshadowing')}
                onRefresh={loadAllData}
              />
              <ForeshadowingTab
                foreshadowingStates={foreshadowingStates}
              />
            </div>
          )}
          {activeTab === 'plot' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ConfirmationInboxTab
                title="情节/时间线待确稿"
                emptyText="暂无情节/时间线待确稿"
                confirmations={pendingConfirmations.filter(c => c.targetType === 'timeline_state' || c.targetType === 'plot')}
                onRefresh={loadAllData}
              />
              <PlotTab
                plotProgress={plotProgress}
              />
            </div>
          )}
          {activeTab === 'consistency' && (
            <ConsistencyTab
              consistencyChecks={consistencyChecks}
              onRefresh={loadAllData}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 总览 Tab
// ============================================================

const OverviewTab: React.FC<{
  characterStates: CharacterState[];
  foreshadowingStates: ForeshadowingState[];
  plotProgress: PlotProgress[];
  consistencyChecks: ConsistencyCheck[];
  pendingCounts: ReturnType<typeof getPendingReviewCounts>;
  pendingConfirmations: StateConfirmation[];
  processedConfirmations: StateConfirmation[];
  chapterMap: Record<string, ChapterListItem>;
  onRefresh: () => void;
}> = ({ characterStates, foreshadowingStates, plotProgress, consistencyChecks, pendingCounts, pendingConfirmations, processedConfirmations, chapterMap, onRefresh }) => {
  const [processedStatusFilter, setProcessedStatusFilter] = useState<'all' | 'confirmed' | 'rejected'>('all');
  const [processedTypeFilter, setProcessedTypeFilter] = useState<string>('all');
  const [processedChapterFilter, setProcessedChapterFilter] = useState<string>('all');
  const activeForeshadowings = foreshadowingStates.filter(f => f.status === 'active' || f.status === 'planted');
  const recoveredForeshadowings = foreshadowingStates.filter(f => f.status === 'recovered');
  const warnings = consistencyChecks.filter(c => c.status === 'warning' || c.status === 'error');
  const processedTypes = Array.from(new Set(processedConfirmations.map(item => item.targetType).filter(Boolean)));
  const processedChapterIds = Array.from(new Set(processedConfirmations.map(item => item.sourceChapterId || 'unbound')));
  const getOverviewChapterLabel = (chapterId: string) => {
    if (chapterId === 'unbound') return '未绑定章节';
    const chapter = chapterMap[chapterId];
    if (!chapter) return `未知章节 (${chapterId})`;
    const volume = chapter.volumeIndex ? `第${chapter.volumeIndex}卷` : '未分卷';
    const chapterNo = chapter.chapterIndex ? `第${chapter.chapterIndex}章` : '未编号章节';
    return `${volume} · ${chapterNo} · ${chapter.title || '未命名章节'}`;
  };
  const filteredProcessedConfirmations = processedConfirmations.filter(item =>
    (processedStatusFilter === 'all' || item.status === processedStatusFilter) &&
    (processedTypeFilter === 'all' || item.targetType === processedTypeFilter) &&
    (processedChapterFilter === 'all' || (item.sourceChapterId || 'unbound') === processedChapterFilter)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <StatCard title="待确稿状态" value={pendingCounts.total} icon="待" color="#f39c12" />
        <StatCard title="人物状态" value={characterStates.length} icon="👤" color="#e94560" />
        <StatCard title="活跃伏笔" value={activeForeshadowings.length} icon="🔮" color="#9b59b6" />
        <StatCard title="已回收伏笔" value={recoveredForeshadowings.length} icon="✅" color="#2ecc71" />
        <StatCard title="一致性警告" value={warnings.length} icon="⚠️" color="#f39c12" />
      </div>

      <div style={{
        padding: '14px',
        backgroundColor: 'rgba(243,156,18,0.06)',
        border: '1px solid rgba(243,156,18,0.18)',
        borderRadius: '8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8c471' }}>待确稿分布</div>
          <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>{pendingCounts.total}项待确稿</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            ['世界观', pendingCounts.world],
            ['人物', pendingCounts.character],
            ['组织', pendingCounts.organization],
            ['伏笔', pendingCounts.foreshadowing],
            ['情节/时间线', pendingCounts.plot],
            ['大纲', pendingCounts.outline],
            ['一致性', pendingCounts.consistency],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.14)' }}>
              <div style={{ fontSize: '10px', color: '#8a8aa0' }}>{label}</div>
              <div style={{ fontSize: '20px', color: '#eaeaea', fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {processedConfirmations.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', margin: 0 }}>
              最近已处理
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(['all', 'confirmed', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setProcessedStatusFilter(status)}
                  style={{
                    padding: '5px 9px',
                    borderRadius: '5px',
                    border: `1px solid ${processedStatusFilter === status ? 'rgba(233,69,96,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    backgroundColor: processedStatusFilter === status ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.025)',
                    color: processedStatusFilter === status ? '#e94560' : '#8a8aa0',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {status === 'all' ? '全部' : status === 'confirmed' ? '已确认' : '已驳回'}
                </button>
              ))}
              <select
                value={processedTypeFilter}
                onChange={event => setProcessedTypeFilter(event.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '5px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backgroundColor: '#141420',
                  color: '#cfd0df',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                }}
              >
                <option value="all">全部类型</option>
                {processedTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={processedChapterFilter}
                onChange={event => setProcessedChapterFilter(event.target.value)}
                style={{
                  maxWidth: '220px',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backgroundColor: '#141420',
                  color: '#cfd0df',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                }}
              >
                <option value="all">全部章节</option>
                {processedChapterIds.map(chapterId => (
                  <option key={chapterId} value={chapterId}>{getOverviewChapterLabel(chapterId)}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredProcessedConfirmations.slice(0, 8).map(item => (
              <ProcessedConfirmationCard
                key={item.id}
                confirmation={item}
                getChapterLabel={getOverviewChapterLabel}
              />
            ))}
            {filteredProcessedConfirmations.length === 0 && (
              <div style={{
                padding: '18px',
                textAlign: 'center',
                color: '#6c6c80',
                border: '1px dashed rgba(255,255,255,0.12)',
                borderRadius: '8px',
              }}>
                当前筛选下没有已处理记录
              </div>
            )}
          </div>
        </div>
      )}

      {pendingConfirmations.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
            待确稿队列
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingConfirmations.slice(0, 8).map(item => (
              <StateConfirmationCard key={item.id} confirmation={item} onRefresh={onRefresh} />
            ))}
          </div>
        </div>
      )}

      {/* 最近更新的人物状态 */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
          最近更新的人物状态
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {characterStates.slice(0, 4).map((character) => (
            <CharacterStateCardMini key={character.characterId} character={character} />
          ))}
        </div>
      </div>

      {/* 一致性检查摘要 */}
      {warnings.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
            一致性检查摘要
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {warnings.slice(0, 5).map((check) => (
              <ConsistencyCheckCardMini key={check.id} check={check} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProcessedConfirmationCard: React.FC<{
  confirmation: StateConfirmation;
  getChapterLabel?: (chapterId: string) => string;
}> = ({ confirmation, getChapterLabel }) => {
  const isConfirmed = confirmation.status === 'confirmed';
  const handledAt = isConfirmed ? confirmation.confirmedAt : confirmation.rejectedAt;
  const handledBy = isConfirmed ? confirmation.confirmedBy : confirmation.rejectedBy;
  const sourceChapterLabel = confirmation.sourceChapterId && getChapterLabel
    ? getChapterLabel(confirmation.sourceChapterId)
    : '未绑定章节';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '10px 12px',
      backgroundColor: isConfirmed ? 'rgba(46,204,113,0.055)' : 'rgba(231,76,60,0.055)',
      border: `1px solid ${isConfirmed ? 'rgba(46,204,113,0.16)' : 'rgba(231,76,60,0.16)'}`,
      borderRadius: '8px',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ color: '#eaeaea', fontSize: '12px', fontWeight: 700 }}>{confirmation.targetLabel}</span>
          <span style={{
            ...reviewBadgeStyle,
            color: isConfirmed ? '#7de8a3' : '#ff8a80',
            backgroundColor: isConfirmed ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
            borderColor: isConfirmed ? 'rgba(46,204,113,0.22)' : 'rgba(231,76,60,0.22)',
          }}>
            {isConfirmed ? '已确认' : '已驳回'}
          </span>
          <span style={reviewBadgeStyle}>{confirmation.targetType}</span>
        </div>
        <div style={{ color: '#8a8aa0', fontSize: '11px', lineHeight: 1.5 }}>{confirmation.summary}</div>
        <div style={{ color: '#6d6d86', fontSize: '10px', marginTop: '4px' }}>
          来源章节: {sourceChapterLabel}
        </div>
      </div>
      <div style={{ flexShrink: 0, color: '#6d6d86', fontSize: '10px', textAlign: 'right' }}>
        <div>{handledAt ? new Date(handledAt).toLocaleString() : new Date(confirmation.updatedAt).toLocaleString()}</div>
        <div>{handledBy || confirmation.createdBy || 'author'}</div>
      </div>
    </div>
  );
};

const ConfirmationInboxTab: React.FC<{
  title: string;
  emptyText: string;
  confirmations: StateConfirmation[];
  onRefresh: () => void;
}> = ({ title, emptyText, confirmations, onRefresh }) => {
  const { id: projectId } = useParams<{ id: string }>();
  const [batching, setBatching] = useState(false);
  const [batchMessage, setBatchMessage] = useState<{ type: 'success' | 'error'; text: string; failed?: Array<{ id: string; error: string }> } | null>(null);
  const [chapterMap, setChapterMap] = useState<Record<string, ChapterListItem>>({});
  const [bindingCandidates, setBindingCandidates] = useState<BindingCandidate[]>([]);
  const groupedConfirmations = confirmations.reduce<Record<string, StateConfirmation[]>>((groups, item) => {
    const key = item.sourceChapterId || 'unbound';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  const getReadableChapterLabel = (chapter: ChapterListItem) => {
    const volume = chapter.volumeIndex ? `第${chapter.volumeIndex}卷` : '未分卷';
    const chapterNo = chapter.chapterIndex ? `第${chapter.chapterIndex}章` : '未编号章节';
    return `${volume} · ${chapterNo} · ${chapter.title || '未命名章节'}`;
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all([
      api.get<ChapterListItem[]>(`/projects/${projectId}/chapters`).catch(() => ({ data: [] })),
      api.get<any[]>(`/projects/${projectId}/characters`).catch(() => ({ data: [] })),
      api.get<any[]>(`/projects/${projectId}/foreshadowings`).catch(() => ({ data: [] })),
      api.get<any[]>(`/projects/${projectId}/outlines`).catch(() => ({ data: [] })),
    ])
      .then(([chapterRes, characterRes, foreshadowingRes, outlineRes]: any[]) => {
        const list = (chapterRes.data?.data ?? chapterRes.data ?? []) as ChapterListItem[];
        if (cancelled || !Array.isArray(list)) return;
        setChapterMap(list.reduce<Record<string, ChapterListItem>>((map, chapter) => {
          map[chapter.id] = chapter;
          return map;
        }, {}));
        const characters = (characterRes.data?.data ?? characterRes.data ?? []) as any[];
        const foreshadowings = (foreshadowingRes.data?.data ?? foreshadowingRes.data ?? []) as any[];
        const outlines = (outlineRes.data?.data ?? outlineRes.data ?? []) as any[];
        const candidates: BindingCandidate[] = [
          ...characters.map(item => ({
            type: 'character',
            id: item.id,
            label: `角色 · ${item.name || item.id}${item.identity ? ` · ${item.identity}` : ''}`,
          })),
          ...foreshadowings.map(item => ({
            type: 'foreshadowing',
            id: item.id,
            label: `伏笔 · ${(item.content || item.title || item.id).slice(0, 40)}`,
          })),
          ...outlines.map(item => ({
            type: 'outline',
            id: item.id,
            label: `大纲 · ${item.title || item.id}`,
          })),
          ...list.map(item => ({
            type: 'timeline_state',
            id: item.id,
            label: `剧情 · ${getReadableChapterLabel(item)}`,
          })),
        ].filter(item => item.id);
        if (!cancelled) setBindingCandidates(candidates);
      })
      .catch(error => {
        console.error('load confirmation inbox metadata failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const getChapterLabel = (chapterId: string) => {
    if (chapterId === 'unbound') return '未绑定章节';
    const chapter = chapterMap[chapterId];
    if (!chapter) return `未知章节 (${chapterId})`;
    return getReadableChapterLabel(chapter);
  };

  const batchUpdate = async (action: 'confirm' | 'reject', targetItems = confirmations) => {
    if (!projectId || targetItems.length === 0) return;

    setBatching(true);
    setBatchMessage(null);
    try {
      const response = await api.post(
        `/projects/${projectId}/state/confirmations/batch/${action}`,
        {
          ids: targetItems.map(item => item.id),
          ...(action === 'confirm' ? { confirmedBy: 'author' } : { rejectedBy: 'author' }),
        },
      ) as unknown as {
        data?: { success?: boolean; updated?: number; failed?: Array<{ id: string; error: string }>; error?: string };
        success?: boolean;
        updated?: number;
        failed?: Array<{ id: string; error: string }>;
        error?: string;
      };
      const result = response.data || response;
      if (result.success === false) {
        setBatchMessage({ type: 'error', text: result.error || 'Batch operation failed.' });
        return;
      }
      const failedCount = result.failed?.length || 0;
      const updatedCount = result.updated ?? targetItems.length;
      setBatchMessage({
        type: failedCount > 0 ? 'error' : 'success',
        text: failedCount > 0
          ? `Updated ${updatedCount} items, ${failedCount} items were skipped.`
          : `Updated ${updatedCount} items.`,
        failed: result.failed,
      });
      onRefresh();
    } catch (error) {
      console.error('batch update confirmations failed:', error);
      setBatchMessage({ type: 'error', text: 'Batch operation failed. Please retry.' });
    } finally {
      setBatching(false);
    }
  };

  const bindConfirmationTarget = async (confirmationId: string, candidate: BindingCandidate) => {
    if (!projectId) return;
    await api.put(`/projects/${projectId}/state/confirmations/${confirmationId}/target`, {
      targetType: candidate.type,
      targetId: candidate.id,
      targetLabel: candidate.label,
    });
    onRefresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        backgroundColor: 'rgba(243,156,18,0.06)',
        border: '1px solid rgba(243,156,18,0.18)',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#eaeaea' }}>{title}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#8a8aa0' }}>
            AI changes are staged here first. Confirmed items are written back into long-term story state.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>
            {confirmations.length} pending
          </span>
          {confirmations.length > 0 && (
            <>
              <button
                onClick={() => batchUpdate('confirm')}
                disabled={batching}
                style={{
                  padding: '6px 10px',
                  borderRadius: '5px',
                  border: '1px solid rgba(46,204,113,0.28)',
                  backgroundColor: batching ? 'rgba(255,255,255,0.04)' : 'rgba(46,204,113,0.1)',
                  color: '#7de8a3',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: batching ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Confirm all
              </button>
              <button
                onClick={() => batchUpdate('reject')}
                disabled={batching}
                style={{
                  padding: '6px 10px',
                  borderRadius: '5px',
                  border: '1px solid rgba(231,76,60,0.25)',
                  backgroundColor: batching ? 'rgba(255,255,255,0.04)' : 'rgba(231,76,60,0.08)',
                  color: '#e74c3c',
                  fontSize: '11px',
                  cursor: batching ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Reject all
              </button>
            </>
          )}
        </div>
      </div>

      {batchMessage && (
        <div style={{
          padding: '9px 12px',
          borderRadius: '6px',
          border: `1px solid ${batchMessage.type === 'success' ? 'rgba(46,204,113,0.22)' : 'rgba(231,76,60,0.24)'}`,
          backgroundColor: batchMessage.type === 'success' ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)',
          color: batchMessage.type === 'success' ? '#7de8a3' : '#ff8a80',
          fontSize: '11px',
        }}>
          <div>{batchMessage.text}</div>
          {batchMessage.failed && batchMessage.failed.length > 0 && (
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px', color: '#ffb4aa' }}>
              {batchMessage.failed.slice(0, 5).map(item => (
                <div key={item.id}>{item.id}: {item.error}</div>
              ))}
              {batchMessage.failed.length > 5 && (
                <div>还有 {batchMessage.failed.length - 5} 条失败未展开。</div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmations.length > 0 ? (
        Object.entries(groupedConfirmations).map(([chapterId, items]) => (
          <div
            key={chapterId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              backgroundColor: 'rgba(255,255,255,0.015)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', color: '#8a8aa0', fontSize: '11px' }}>
              <span>来源章节: {getChapterLabel(chapterId)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{items.length} updates</span>
                <button
                  onClick={() => batchUpdate('confirm', items)}
                  disabled={batching}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid rgba(46,204,113,0.24)',
                    backgroundColor: 'rgba(46,204,113,0.08)',
                    color: '#7de8a3',
                    fontSize: '10px',
                    cursor: batching ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Confirm chapter
                </button>
                <button
                  onClick={() => batchUpdate('reject', items)}
                  disabled={batching}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid rgba(231,76,60,0.22)',
                    backgroundColor: 'rgba(231,76,60,0.07)',
                    color: '#e74c3c',
                    fontSize: '10px',
                    cursor: batching ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Reject chapter
                </button>
              </div>
            </div>
            {items.map(item => (
              <StateConfirmationCard
                key={item.id}
                confirmation={item}
                candidates={bindingCandidates}
                onBindTarget={bindConfirmationTarget}
                getChapterLabel={getChapterLabel}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        ))
      ) : (
        <div style={{
          padding: '28px',
          textAlign: 'center',
          color: '#6c6c80',
          border: '1px dashed rgba(255,255,255,0.12)',
          borderRadius: '8px',
        }}>
          {emptyText}
        </div>
      )}
    </div>
  );
};

const ConfirmationListTab: React.FC<{
  title: string;
  emptyText: string;
  confirmations: StateConfirmation[];
  onRefresh: () => void;
}> = ({ title, emptyText, confirmations, onRefresh }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 14px',
      borderRadius: '8px',
      backgroundColor: 'rgba(243,156,18,0.06)',
      border: '1px solid rgba(243,156,18,0.18)',
    }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#eaeaea' }}>{title}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#8a8aa0' }}>
          AI生成正文后自动提取，作者确稿后才写入后续生成上下文。
        </div>
      </div>
      <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>
        {confirmations.length}待确稿
      </span>
    </div>

    {confirmations.length > 0 ? (
      confirmations.map(item => (
        <StateConfirmationCard key={item.id} confirmation={item} onRefresh={onRefresh} />
      ))
    ) : (
      <div style={{
        padding: '28px',
        textAlign: 'center',
        color: '#6c6c80',
        border: '1px dashed rgba(255,255,255,0.12)',
        borderRadius: '8px',
      }}>
        {emptyText}
      </div>
    )}
  </div>
);

// ============================================================
// 人物状态 Tab
// ============================================================

const CharacterTab: React.FC<{
  projectId?: string;
  characterStates: CharacterState[];
  onRefresh: () => void;
}> = ({ projectId, characterStates, onRefresh }) => {
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterState | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {characterStates.map((character) => (
          <CharacterStateCard
            key={character.characterId}
            projectId={projectId}
            character={character}
            onSelect={() => setSelectedCharacter(character)}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      {/* 详情弹窗 */}
      {selectedCharacter && (
        <CharacterDetailModal
          projectId={projectId}
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

// ============================================================
// 伏笔状态 Tab
// ============================================================

const ForeshadowingTab: React.FC<{
  foreshadowingStates: ForeshadowingState[];
}> = ({ foreshadowingStates }) => {
  const active = foreshadowingStates.filter(f => f.status === 'active' || f.status === 'planted');
  const recovered = foreshadowingStates.filter(f => f.status === 'recovered');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
          活跃伏笔 ({active.length})
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {active.map((fs) => (
            <ForeshadowingStateCard key={fs.foreshadowingId} foreshadowing={fs} />
          ))}
        </div>
      </div>

      {recovered.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
            已回收伏笔 ({recovered.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            {recovered.map((fs) => (
              <ForeshadowingStateCard key={fs.foreshadowingId} foreshadowing={fs} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 情节进展 Tab
// ============================================================

const PlotTab: React.FC<{
  plotProgress: PlotProgress[];
}> = ({ plotProgress }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 情绪曲线图（简化版） */}
      <div style={{
        padding: '16px',
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>
          情绪曲线图
        </h3>
        <EmotionalCurveChart data={plotProgress} />
      </div>

      {/* 章节进展列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
        {plotProgress.map((progress) => (
          <PlotProgressCard key={progress.id} progress={progress} />
        ))}
      </div>
    </div>
  );
};

// ============================================================
// 一致性检查 Tab
// ============================================================

const ConsistencyTab: React.FC<{
  consistencyChecks: ConsistencyCheck[];
  onRefresh: () => void;
}> = ({ consistencyChecks, onRefresh }) => {
  const [filter, setFilter] = useState<'all' | 'warning' | 'error'>('all');

  const filtered = filter === 'all' ? consistencyChecks : consistencyChecks.filter(c => c.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 过滤器 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['all', 'warning', 'error'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            style={{
              padding: '6px 12px',
              backgroundColor: filter === f ? 'rgba(233,69,96,0.1)' : 'transparent',
              border: `1px solid ${filter === f ? '#e94560' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '4px',
              color: filter === f ? '#e94560' : '#6c6c80',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {f === 'all' ? '全部' : f === 'warning' ? '⚠️ 警告' : '❌ 错误'}
          </button>
        ))}
      </div>

      {/* 检查列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map((check) => (
          <ConsistencyCheckCard key={check.id} check={check} onResolve={onRefresh} />
        ))}
      </div>
    </div>
  );
};

// ============================================================
// 子组件
// ============================================================

// 统计卡片
const StatCard: React.FC<{ title: string; value: number; icon: string; color: string }> = ({ title, value, icon, color }) => (
  <div style={{
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '12px', color: '#6c6c80', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#eaeaea' }}>{value}</div>
      </div>
      <div style={{ fontSize: '32px' }}>{icon}</div>
    </div>
  </div>
);

// 人物状态卡片（简化版）
const CharacterStateCardMini: React.FC<{ character: CharacterState }> = ({ character }) => {
  const states = character.states;
  return (
    <div style={{
      padding: '12px',
      backgroundColor: 'rgba(255,255,255,0.02)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '8px' }}>
        {states.name || character.characterId}
        {character.needsReview && <span style={{ ...reviewBadgeStyle, marginLeft: '8px', color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>待确稿</span>}
      </div>
      <div style={{ fontSize: '11px', color: '#8a8aa0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div>位置: {states.location || '未知'}</div>
        <div>心理状态: {states.mental_state || '稳定'}</div>
        <div>最后更新: {new Date(character.timestamp).toLocaleString()}</div>
      </div>
    </div>
  );
};

const StateConfirmationCard: React.FC<{
  confirmation: StateConfirmation;
  candidates?: BindingCandidate[];
  onBindTarget?: (confirmationId: string, candidate: BindingCandidate) => Promise<void>;
  getChapterLabel?: (chapterId: string) => string;
  onRefresh: () => void;
}> = ({ confirmation, candidates = [], onBindTarget, getChapterLabel, onRefresh }) => {
  const { id: projectId } = useParams<{ id: string }>();
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [binding, setBinding] = useState(false);
  const colorMap: Record<string, string> = {
    world_setting: '#3498db',
    character: '#2ecc71',
    organization: '#f39c12',
    timeline_state: '#9b59b6',
    outline: '#e94560',
    foreshadowing: '#1abc9c',
  };
  const color = colorMap[confirmation.targetType] || '#8a8aa0';
  const matchedTarget = confirmation.payload?.matchedTarget as { id?: string | null; label?: string; match?: string } | undefined;
  const boundTargetId = confirmation.targetId || matchedTarget?.id;
  const boundTargetLabel = matchedTarget?.label || confirmation.targetLabel;
  const isBoundToTarget = Boolean(boundTargetId);
  const normalizedTargetType = confirmation.targetType === 'plot' ? 'timeline_state' : confirmation.targetType;
  const availableCandidates = candidates.filter(candidate =>
    candidate.type === normalizedTargetType ||
    (!['character', 'foreshadowing', 'outline', 'timeline_state'].includes(normalizedTargetType) && candidate.type === 'outline')
  );
  const candidateKeyword = candidateSearch.trim().toLowerCase();
  const filteredCandidates = candidateKeyword
    ? availableCandidates.filter(candidate =>
        candidate.label.toLowerCase().includes(candidateKeyword) ||
        candidate.id.toLowerCase().includes(candidateKeyword) ||
        candidate.type.toLowerCase().includes(candidateKeyword)
      )
    : availableCandidates;

  const bindTarget = async () => {
    const candidate = filteredCandidates.find(item => `${item.type}::${item.id}` === selectedCandidateKey);
    if (!candidate || !onBindTarget) return;
    setBinding(true);
    try {
      await onBindTarget(confirmation.id, candidate);
    } finally {
      setBinding(false);
    }
  };

  const confirm = async () => {
    if (!projectId) return;
    await api.post(`/projects/${projectId}/state/confirmations/${confirmation.id}/confirm`, { confirmedBy: 'author' });
    onRefresh();
  };

  const reject = async () => {
    if (!projectId) return;
    await api.post(`/projects/${projectId}/state/confirmations/${confirmation.id}/reject`, { rejectedBy: 'author' });
    onRefresh();
  };

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      padding: '10px 12px',
      backgroundColor: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
    }}>
      <div style={{
        width: '7px',
        alignSelf: 'stretch',
        borderRadius: '4px',
        backgroundColor: color,
        opacity: 0.8,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
          <span style={{ color: '#eaeaea', fontSize: '12px', fontWeight: 700 }}>{confirmation.targetLabel}</span>
          <span style={{
            ...reviewBadgeStyle,
            color: isBoundToTarget ? '#7de8a3' : '#f8c471',
            backgroundColor: isBoundToTarget ? 'rgba(46,204,113,0.1)' : 'rgba(243,156,18,0.1)',
            borderColor: isBoundToTarget ? 'rgba(46,204,113,0.22)' : 'rgba(243,156,18,0.2)',
          }}>
            {isBoundToTarget ? '已绑定对象' : '未绑定对象'}
          </span>
          <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>待确稿</span>
          <span style={reviewBadgeStyle}>带确稿</span>
        </div>
        <div style={{ color: '#8a8aa0', fontSize: '11px', lineHeight: 1.5 }}>{confirmation.summary}</div>
        <div style={{ color: isBoundToTarget ? '#6fca8a' : '#c49b5d', fontSize: '10px', marginTop: '3px' }}>
          写回对象: {isBoundToTarget ? `${boundTargetLabel} (${boundTargetId})` : '未匹配到结构化对象'}
          {matchedTarget?.match ? ` · ${matchedTarget.match}` : ''}
        </div>
        {!isBoundToTarget && onBindTarget && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px' }}>
            <input
              value={candidateSearch}
              onChange={event => {
                setCandidateSearch(event.target.value);
                setSelectedCandidateKey('');
              }}
              placeholder="搜索角色/伏笔/大纲"
              disabled={binding || availableCandidates.length === 0}
              style={{
                width: '150px',
                padding: '5px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.12)',
                backgroundColor: '#141420',
                color: '#cfd0df',
                fontSize: '11px',
                fontFamily: 'inherit',
              }}
            />
            <select
              value={selectedCandidateKey}
              onChange={event => setSelectedCandidateKey(event.target.value)}
              disabled={binding || filteredCandidates.length === 0}
              style={{
                minWidth: '220px',
                maxWidth: '360px',
                padding: '5px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.12)',
                backgroundColor: '#141420',
                color: '#cfd0df',
                fontSize: '11px',
                fontFamily: 'inherit',
              }}
            >
              <option value="">{availableCandidates.length === 0 ? '暂无可绑定对象' : filteredCandidates.length === 0 ? '无匹配对象' : '选择写回对象'}</option>
              {filteredCandidates.map(candidate => (
                <option key={`${candidate.type}::${candidate.id}`} value={`${candidate.type}::${candidate.id}`}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <button
              onClick={bindTarget}
              disabled={binding || !selectedCandidateKey}
              style={{
                padding: '5px 9px',
                borderRadius: '5px',
                border: '1px solid rgba(52,152,219,0.25)',
                backgroundColor: binding || !selectedCandidateKey ? 'rgba(255,255,255,0.04)' : 'rgba(52,152,219,0.1)',
                color: '#8cc8ff',
                fontSize: '11px',
                cursor: binding || !selectedCandidateKey ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {binding ? '绑定中' : '绑定'}
            </button>
          </div>
        )}
        <div style={{ color: '#6d6d86', fontSize: '10px', marginTop: '3px' }}>
          Chapter source: {confirmation.sourceChapterId && getChapterLabel ? getChapterLabel(confirmation.sourceChapterId) : 'not bound'}
        </div>
        <div style={{ color: '#5f5f75', fontSize: '10px', marginTop: '3px' }}>
          来源章节: {confirmation.sourceChapterId || '未绑定'} · {new Date(confirmation.createdAt).toLocaleString()}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={confirm} style={{
          padding: '5px 9px',
          borderRadius: '5px',
          border: '1px solid rgba(46,204,113,0.28)',
          backgroundColor: 'rgba(46,204,113,0.1)',
          color: '#7de8a3',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>确认</button>
        <button onClick={reject} style={{
          padding: '5px 9px',
          borderRadius: '5px',
          border: '1px solid rgba(231,76,60,0.25)',
          backgroundColor: 'rgba(231,76,60,0.08)',
          color: '#e74c3c',
          fontSize: '11px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>驳回</button>
      </div>
    </div>
  );
};

// 人物状态卡片（完整版）
const CharacterStateCard: React.FC<{
  projectId?: string;
  character: CharacterState;
  onSelect: () => void;
  onRefresh: () => void;
}> = ({ projectId, character, onSelect, onRefresh }) => {
  const [lockedFields, setLockedFields] = useState<Record<string, boolean>>({});
  const states = character.states;

  const handleLockToggle = async (fieldPath: string) => {
    if (!projectId) return;
    try {
      await api.put(`/projects/${projectId}/state/character/${character.characterId}/lock`, {
        fieldPath,
        locked: !lockedFields[fieldPath],
      });
      setLockedFields(prev => ({ ...prev, [fieldPath]: !prev[fieldPath] }));
    } catch (error) {
      console.error('锁定字段失败:', error);
    }
  };

  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'rgba(255,255,255,0.02)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea' }}>
          {states.name || character.characterId}
          {character.needsReview && <span style={{ ...reviewBadgeStyle, marginLeft: '8px', color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>待确稿</span>}
          <span style={{ ...reviewBadgeStyle, marginLeft: '6px' }}>带确稿</span>
        </div>
        <button
          onClick={onSelect}
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(233,69,96,0.1)',
            border: '1px solid rgba(233,69,96,0.3)',
            borderRadius: '4px',
            color: '#e94560',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          详情
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* 位置 */}
        <StateField
          label="当前位置"
          value={states.location || '未知'}
          locked={lockedFields['location'] || false}
          onLockToggle={() => handleLockToggle('location')}
        />

        {/* 心理状态 */}
        <StateField
          label="心理状态"
          value={states.mental_state || '稳定'}
          locked={lockedFields['mental_state'] || false}
          onLockToggle={() => handleLockToggle('mental_state')}
        />

        {/* 目标 */}
        <StateField
          label="当前目标"
          value={states.motivation ? JSON.stringify(states.motivation) : '未知'}
          locked={lockedFields['motivation'] || false}
          onLockToggle={() => handleLockToggle('motivation')}
        />

        {/* 最后更新 */}
        <div style={{ fontSize: '10px', color: '#6c6c80', marginTop: '8px' }}>
          最后更新: {new Date(character.timestamp).toLocaleString()}
          {character.changeSummary && (
            <div style={{ marginTop: '4px', color: '#8a8aa0' }}>
              变更: {character.changeSummary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 状态字段组件
const StateField: React.FC<{
  label: string;
  value: string;
  locked: boolean;
  onLockToggle: () => void;
}> = ({ label, value, locked, onLockToggle }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '10px', color: '#6c6c80', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#eaeaea' }}>{value}</div>
    </div>
    <button
      onClick={onLockToggle}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '4px',
      }}
      title={locked ? '已锁定，AI 不会自动修改' : '未锁定，AI 可以自动修改'}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  </div>
);

// 人物详情弹窗
const CharacterDetailModal: React.FC<{
  projectId?: string;
  character: CharacterState;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ projectId, character, onClose, onRefresh }) => {
  const [editedStates, setEditedStates] = useState<Record<string, any>>(character.states);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/state/character/${character.characterId}`, {
        states: editedStates,
      });
      alert('✅ 保存成功！');
      onRefresh();
      onClose();
    } catch (error) {
      console.error('保存失败:', error);
      alert('❌ 保存失败，请重试');
    }
    setSaving(false);
  };

  const handleRollback = async (version: number) => {
    if (!projectId) return;
    try {
      await api.post(`/projects/${projectId}/state/character/${character.characterId}/rollback`, {
        version,
      });
      alert('✅ 回滚成功！');
      onRefresh();
    } catch (error) {
      console.error('回滚失败:', error);
      alert('❌ 回滚失败，请重试');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
    }} onClick={onClose}>
      <div style={{
        width: '600px', maxHeight: '80vh', overflow: 'auto',
        backgroundColor: '#1a1a2e', borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#eaeaea', margin: 0 }}>
            {character.states.name || character.characterId} - 详细状态
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(editedStates).map(([key, value]) => (
              <div key={key}>
                <label style={{ fontSize: '11px', color: '#6c6c80', marginBottom: '4px', display: 'block' }}>
                  {key}
                </label>
                <input
                  value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  onChange={(e) => setEditedStates(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a4a',
                    borderRadius: '6px',
                    color: '#eaeaea',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* 版本历史 */}
          {Array.isArray(character.history) && character.history.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '8px' }}>
                版本历史
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {character.history.map((h) => (
                  <div key={h.version} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderRadius: '4px',
                  }}>
                    <div style={{ fontSize: '11px', color: '#8a8aa0' }}>
                      版本 {h.version} - {h.source} - {new Date(h.createdAt).toLocaleString()}
                    </div>
                    <button
                      onClick={() => handleRollback(h.version)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'rgba(52,152,219,0.1)',
                        border: '1px solid rgba(52,152,219,0.3)',
                        borderRadius: '4px',
                        color: '#3498db',
                        fontSize: '10px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      回滚到此版本
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button onClick={onClose}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
              backgroundColor: 'transparent', color: '#c0c0d0', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            取消
          </button>
          <button onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              backgroundColor: saving ? 'rgba(233,69,96,0.5)' : '#e94560', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
            {saving ? '保存中...' : '💾 保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 伏笔状态卡片
const ForeshadowingStateCard: React.FC<{ foreshadowing: ForeshadowingState }> = ({ foreshadowing }) => (
  <div style={{
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea' }}>
        {foreshadowing.foreshadowingId}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {(foreshadowing.needsReview || foreshadowing.detectedAutomatically) && <span style={{ ...reviewBadgeStyle, color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>待确稿</span>}
        <span style={{
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: foreshadowing.status === 'recovered' ? 'rgba(46,204,113,0.1)' : 'rgba(155,89,182,0.1)',
          color: foreshadowing.status === 'recovered' ? '#2ecc71' : '#9b59b6',
        }}>
          {foreshadowing.status === 'planted' ? '已埋设' :
           foreshadowing.status === 'active' ? '活跃' :
           foreshadowing.status === 'recovered' ? '已回收' : '已放弃'}
        </span>
      </div>
    </div>
    <div style={{ fontSize: '11px', color: '#8a8aa0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div>埋设章节: 第{foreshadowing.plantedChapter}章</div>
      {foreshadowing.recoveredChapter && (
        <div>回收章节: 第{foreshadowing.recoveredChapter}章</div>
      )}
      {foreshadowing.lastMentionedChapter && (
        <div>最后提及: 第{foreshadowing.lastMentionedChapter}章</div>
      )}
      <div>提及次数: {foreshadowing.mentionCount || 0}</div>
    </div>
  </div>
);

// 情节进展卡片
const PlotProgressCard: React.FC<{ progress: PlotProgress }> = ({ progress }) => (
  <div style={{
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
  }}>
    <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '8px' }}>
      第{progress.chapterIndex}章
      {progress.needsReview !== false && <span style={{ ...reviewBadgeStyle, marginLeft: '8px', color: '#f8c471', backgroundColor: 'rgba(243,156,18,0.12)', borderColor: 'rgba(243,156,18,0.24)' }}>待确稿</span>}
      <span style={{ ...reviewBadgeStyle, marginLeft: '6px' }}>带确稿</span>
    </div>
    <div style={{ fontSize: '11px', color: '#8a8aa0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div>情绪曲线: {progress.emotionalBeat} (强度: {progress.emotionalIntensity})</div>
      <div>节奏评分: {progress.pacingScore}/10</div>
      <div>主线进度: {progress.mainGoalProgress}%</div>
      {progress.turningPoints.length > 0 && (
        <div>转折点: {progress.turningPoints.join(', ')}</div>
      )}
    </div>
  </div>
);

// 情绪曲线图（简化版）
const EmotionalCurveChart: React.FC<{ data: PlotProgress[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', color: '#6c6c80', padding: '20px' }}>暂无数据</div>;
  }

  const maxIntensity = Math.max(...data.map(d => d.emotionalIntensity));
  const minIntensity = Math.min(...data.map(d => d.emotionalIntensity));

  return (
    <div style={{ position: 'relative', height: '200px', padding: '20px 0' }}>
      {/* Y 轴标签 */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: '#6c6c80' }}>
        <span>{maxIntensity}</span>
        <span>{Math.round((maxIntensity + minIntensity) / 2)}</span>
        <span>{minIntensity}</span>
      </div>

      {/* 图表区域 */}
      <div style={{ marginLeft: '50px', height: '100%', position: 'relative' }}>
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          {/* 网格线 */}
          <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(255,255,255,0.06)" />
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" />
          <line x1="0" y1="100%" x2="100%" y2="100%" stroke="rgba(255,255,255,0.06)" />

          {/* 曲线 */}
          <polyline
            points={data.map((d, i) => {
              const x = (i / (data.length - 1)) * 100;
              const y = 100 - ((d.emotionalIntensity - minIntensity) / (maxIntensity - minIntensity || 1)) * 100;
              return `${x}%,${y}%`;
            }).join(' ')}
            fill="none"
            stroke="#e94560"
            strokeWidth="2"
          />

          {/* 数据点 */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - ((d.emotionalIntensity - minIntensity) / (maxIntensity - minIntensity || 1)) * 100;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill="#e94560"
              />
            );
          })}
        </svg>

        {/* X 轴标签 */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '-20px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6c6c80' }}>
          {data.filter((_, i) => i % Math.ceil(data.length / 10) === 0).map((d, i) => (
            <span key={i}>{d.chapterIndex}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// 一致性检查卡片（简化版）
const ConsistencyCheckCardMini: React.FC<{ check: ConsistencyCheck }> = ({ check }) => (
  <div style={{
    padding: '8px 12px',
    backgroundColor: check.status === 'error' ? 'rgba(231,76,60,0.06)' : 'rgba(243,156,18,0.06)',
    borderRadius: '6px',
    border: `1px solid ${check.status === 'error' ? 'rgba(231,76,60,0.2)' : 'rgba(243,156,18,0.2)'}`,
    fontSize: '12px',
    color: check.status === 'error' ? '#e74c3c' : '#f39c12',
  }}>
    {check.message}
  </div>
);

// 一致性检查卡片（完整版）
const ConsistencyCheckCard: React.FC<{
  check: ConsistencyCheck;
  onResolve: () => void;
}> = ({ check, onResolve }) => (
  <div style={{
    padding: '12px',
    backgroundColor: check.status === 'error' ? 'rgba(231,76,60,0.06)' : 'rgba(243,156,18,0.06)',
    borderRadius: '8px',
    border: `1px solid ${check.status === 'error' ? 'rgba(231,76,60,0.2)' : 'rgba(243,156,18,0.2)'}`,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea' }}>
        {check.checkType === 'character' ? '人物一致性' :
         check.checkType === 'world_setting' ? '世界观一致性' :
         check.checkType === 'timeline' ? '时间线一致性' : '情节逻辑一致性'}
        <span style={{
          marginLeft: '8px',
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: check.status === 'error' ? 'rgba(231,76,60,0.1)' : 'rgba(243,156,18,0.1)',
          color: check.status === 'error' ? '#e74c3c' : '#f39c12',
        }}>
          {check.status === 'warning' ? '⚠️ 警告' : '❌ 错误'}
        </span>
      </div>
      {!check.resolved && (
        <button
          onClick={onResolve}
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(46,204,113,0.1)',
            border: '1px solid rgba(46,204,113,0.3)',
            borderRadius: '4px',
            color: '#2ecc71',
            fontSize: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          标记为已解决
        </button>
      )}
    </div>
    <div style={{ fontSize: '12px', color: '#c0c0d0', marginBottom: '8px' }}>
      {check.message}
    </div>
    {check.details && check.details.length > 0 && (
      <div style={{ fontSize: '11px', color: '#8a8aa0' }}>
        {check.details.map((detail, idx) => (
          <div key={idx} style={{ marginBottom: '4px' }}>
            <div>字段: {detail.field}</div>
            <div>期望: {detail.expected}</div>
            <div>实际: {detail.actual}</div>
            {detail.suggestion && <div style={{ color: '#3498db' }}>建议: {detail.suggestion}</div>}
          </div>
        ))}
      </div>
    )}
    <div style={{ fontSize: '10px', color: '#6c6c80', marginTop: '8px' }}>
      检测时间: {new Date(check.detectedAt).toLocaleString()}
      {check.chapterIndex && <span style={{ marginLeft: '12px' }}>章节: 第{check.chapterIndex}章</span>}
    </div>
  </div>
);

export default StatePage;
