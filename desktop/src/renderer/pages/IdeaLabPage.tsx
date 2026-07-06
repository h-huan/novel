/**
 * IdeaLabPage - 想法孵化页面
 *
 * 用户从「从想法开始」创建草稿后进入此页面。
 * 流程: 原始想法 → AI 追问 → 用户回答 → AI 完善 → 确认 → 创建项目
 *
 * 页面区域:
 * 1. 顶部信息区
 * 2. 追问区
 * 3. 完善版想法区
 * 4. 成熟度评分区
 * 5. 底部操作区
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIdeaLabStore } from '../stores/ideaLabStore';
import { openProject } from '../lib/openProject';
import type { AnswerItem } from '../stores/ideaLabStore';

// ========== 常量 ==========

const TYPE_LABELS: Record<string, string> = {
  short_story: '短篇',
  long_novel: '长篇',
};

const PLATFORM_LABELS: Record<string, string> = {
  zhihu: '知乎盐选',
  fanqie: '番茄',
  qidian: '起点',
  douyin: '抖音',
  xiaohongshu: '小红书',
  custom: '自定义',
  generic: '通用',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  questioning: '追问中',
  answered: '已回答',
  refining: '完善中',
  refined: '已完善',
  confirmed: '已确认',
  converted: '已转换',
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#6c6c80',
  questioning: '#f39c12',
  answered: '#3498db',
  refining: '#e67e22',
  refined: '#2ecc71',
  confirmed: '#27ae60',
  converted: '#95a5a6',
};

// ========== 子组件: 追问区 ==========

interface QuestionsSectionProps {
  questions: Array<{ id: string; question: string; reason: string }>;
  answers: AnswerItem[];
  onAnswerChange: (questionId: string, answer: string) => void;
}

const QuestionsSection: React.FC<QuestionsSectionProps> = ({ questions, answers, onAnswerChange }) => {
  return (
    <div style={sectionStyles.container}>
      <h3 style={sectionStyles.title}>💡 AI 追问</h3>
      <p style={sectionStyles.subtitle}>
        根据你的想法，AI 生成了以下追问。填写回答能帮助 AI 更好地完善你的想法。
      </p>
      <div style={sectionStyles.list}>
        {questions.map((q, idx) => {
          const answer = answers.find((a) => a.questionId === q.id);
          return (
            <div key={q.id} style={sectionStyles.card}>
              <div style={sectionStyles.questionHeader}>
                <span style={sectionStyles.questionNumber}>Q{idx + 1}</span>
                <span style={sectionStyles.questionText}>{q.question}</span>
              </div>
              {q.reason && (
                <p style={sectionStyles.reason}>💡 {q.reason}</p>
              )}
              <textarea
                style={sectionStyles.textarea}
                value={answer?.answer || ''}
                onChange={(e) => onAnswerChange(q.id, e.target.value)}
                placeholder="输入你的回答..."
                rows={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ========== 子组件: 完善版想法区 ==========

interface RefinedIdeaSectionProps {
  refinedIdea: {
    titleSuggestions: string[];
    oneLineHook: string;
    protagonist: string;
    coreConflict: string;
    worldSeed: string;
    characterSeed: string;
    organizationSeed: string;
    sellingPoints: string[];
    platformFit: string;
    storyType: string;
    targetAudience: string;
    shortStoryFit: string;
    longNovelFit: string;
    recommendedType: string;
    nextStep: string;
  } | null;
}

const RefinedIdeaSection: React.FC<RefinedIdeaSectionProps> = ({ refinedIdea }) => {
  if (!refinedIdea) return null;

  return (
    <div style={sectionStyles.container}>
      <h3 style={sectionStyles.title}>✨ 完善版想法</h3>

      <div style={refinedStyles.grid}>
        {refinedIdea.titleSuggestions && refinedIdea.titleSuggestions.length > 0 && (
          <div style={refinedStyles.item}>
            <span style={refinedStyles.label}>标题建议</span>
            <div style={refinedStyles.tagList}>
              {refinedIdea.titleSuggestions.map((t, i) => (
                <span key={i} style={refinedStyles.tag}>{t}</span>
              ))}
            </div>
          </div>
        )}

        <FieldDisplay label="一句话钩子" value={refinedIdea.oneLineHook} />
        <FieldDisplay label="主角设定" value={refinedIdea.protagonist} />
        <FieldDisplay label="核心冲突" value={refinedIdea.coreConflict} />
        <FieldDisplay label="世界观种子" value={refinedIdea.worldSeed} />
        <FieldDisplay label="角色种子" value={refinedIdea.characterSeed} />

        {refinedIdea.organizationSeed && (
          <FieldDisplay label="势力种子" value={refinedIdea.organizationSeed} />
        )}

        {refinedIdea.sellingPoints && refinedIdea.sellingPoints.length > 0 && (
          <div style={refinedStyles.item}>
            <span style={refinedStyles.label}>卖点</span>
            <div style={refinedStyles.tagList}>
              {refinedIdea.sellingPoints.map((sp, i) => (
                <span key={i} style={{ ...refinedStyles.tag, backgroundColor: 'rgba(233,69,96,0.15)', color: '#e94560' }}>{sp}</span>
              ))}
            </div>
          </div>
        )}

        <FieldDisplay label="平台适配" value={refinedIdea.platformFit} />
        <FieldDisplay label="故事类型" value={refinedIdea.storyType} />
        <FieldDisplay label="目标读者" value={refinedIdea.targetAudience} />
        <FieldDisplay label="短篇适配" value={refinedIdea.shortStoryFit} />
        <FieldDisplay label="长篇适配" value={refinedIdea.longNovelFit} />
        <FieldDisplay label="推荐类型" value={refinedIdea.recommendedType === 'short_story' ? '短篇' : '长篇'} />

        <FieldDisplay label="下一步建议" value={refinedIdea.nextStep} />
      </div>
    </div>
  );
};

const FieldDisplay: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div style={refinedStyles.item}>
      <span style={refinedStyles.label}>{label}</span>
      <p style={refinedStyles.value}>{value}</p>
    </div>
  );
};

// ========== 子组件: 成熟度评分区 ==========

interface MaturitySectionProps {
  score: number;
  report: {
    strengths: string[];
    missingItems: string[];
    risks: string[];
    canConvertToProject: boolean;
  } | null;
}

const MaturitySection: React.FC<MaturitySectionProps> = ({ score, report }) => {
  if (!report) return null;

  const scoreColor = score >= 70 ? '#2ecc71' : score >= 40 ? '#f39c12' : '#e94560';

  return (
    <div style={sectionStyles.container}>
      <h3 style={sectionStyles.title}>📊 成熟度评分</h3>

      <div style={maturityStyles.scoreArea}>
        <div
          style={{
            ...maturityStyles.scoreCircle,
            borderColor: scoreColor,
            color: scoreColor,
          }}
        >
          <span style={maturityStyles.scoreNumber}>{score}</span>
          <span style={maturityStyles.scoreUnit}>/100</span>
        </div>
        <div style={maturityStyles.scoreInfo}>
          {score >= 70 ? (
            <p style={{ ...maturityStyles.scoreLabel, color: '#2ecc71' }}>
              ✅ 想法已成熟，可以创建项目
            </p>
          ) : score >= 40 ? (
            <p style={{ ...maturityStyles.scoreLabel, color: '#f39c12' }}>
              ⚠️ 想法有一定基础，建议继续完善后再创建项目
            </p>
          ) : (
            <p style={{ ...maturityStyles.scoreLabel, color: '#e94560' }}>
              ❌ 想法还不够成熟，建议继续完善
            </p>
          )}
        </div>
      </div>

      {report.strengths.length > 0 && (
        <div style={maturityStyles.listBlock}>
          <h4 style={maturityStyles.listTitle}>✅ 优势</h4>
          <ul style={maturityStyles.list}>
            {report.strengths.map((s, i) => (
              <li key={i} style={{ ...maturityStyles.listItem, color: '#2ecc71' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {report.missingItems.length > 0 && (
        <div style={maturityStyles.listBlock}>
          <h4 style={maturityStyles.listTitle}>📋 缺失项</h4>
          <ul style={maturityStyles.list}>
            {report.missingItems.map((m, i) => (
              <li key={i} style={{ ...maturityStyles.listItem, color: '#f39c12' }}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {report.risks.length > 0 && (
        <div style={maturityStyles.listBlock}>
          <h4 style={maturityStyles.listTitle}>⚠️ 风险点</h4>
          <ul style={maturityStyles.list}>
            {report.risks.map((r, i) => (
              <li key={i} style={{ ...maturityStyles.listItem, color: '#e94560' }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ========== 子组件: 确认想法编辑区 ==========

interface ConfirmSectionProps {
  /** textarea 当前值，外部维护状态 */
  value: string;
  onValueChange: (value: string) => void;
}

const ConfirmSection: React.FC<ConfirmSectionProps> = ({ value, onValueChange }) => {
  return (
    <div style={sectionStyles.container}>
      <h3 style={sectionStyles.title}>✅ 确认想法</h3>
      <p style={sectionStyles.subtitle}>
        这是最终确认的成熟想法。你可以在此编辑修改，确认后将用于创建项目。
      </p>
      <textarea
        style={sectionStyles.confirmTextarea}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        rows={4}
      />
    </div>
  );
};

// ========== 主组件 ==========

const IdeaLabPage: React.FC = () => {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { draft, loading, error, questionsIsFallback, refineIsFallback, fetchDraft, generateQuestions, saveAnswers, refineIdea, confirmIdea, convertToProject } = useIdeaLabStore();

  const [localAnswers, setLocalAnswers] = useState<AnswerItem[]>([]);
  const [confirmedText, setConfirmedText] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [showLowScoreWarning, setShowLowScoreWarning] = useState(false);

  // 加载草稿
  useEffect(() => {
    if (draftId) {
      fetchDraft(draftId).then((d) => {
        if (d.answers) setLocalAnswers(d.answers);
        if (d.confirmedIdea) setConfirmedText(d.confirmedIdea);
      }).catch(() => {
        // error handled in store
      });
    }
  }, [draftId, fetchDraft]);

  // 在 refinedIdea 出现时初始化确认文本（仅首次）
  useEffect(() => {
    if (draft && draft.refinedIdea && draft.refinedIdea.oneLineHook && !confirmedText && draft.status !== 'confirmed' && draft.status !== 'converted') {
      setConfirmedText(draft.refinedIdea.oneLineHook);
    }
  }, [draft?.refinedIdea?.oneLineHook]);

  // 初始化项目标题
  useEffect(() => {
    if (draft && !projectTitle) {
      setProjectTitle(draft.title || draft.rawIdea.slice(0, 30));
    }
  }, [draft, projectTitle]);

  // 回答变更处理
  const handleAnswerChange = useCallback((questionId: string, answer: string) => {
    setLocalAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === questionId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], answer };
        return updated;
      }
      return [...prev, { questionId, answer }];
    });
  }, []);

  // 处理保存回答
  const handleSaveAnswers = async () => {
    if (!draft) return;
    const filledAnswers = localAnswers.filter((a) => a.answer.trim());
    if (filledAnswers.length === 0) return;

    try {
      await saveAnswers(draft.id, filledAnswers);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // error handled in store
    }
  };

  // 处理完善想法
  const handleRefine = async () => {
    if (!draft) return;
    await refineIdea(draft.id);
  };

  // 处理确认想法
  const handleConfirm = async () => {
    if (!draft) return;

    // 检查成熟度
    if (draft.maturityScore < 70 && !showLowScoreWarning) {
      setShowLowScoreWarning(true);
      return;
    }

    try {
      const ideaToConfirm = confirmedText || draft.refinedIdea?.oneLineHook || draft.rawIdea;
      await confirmIdea(draft.id, ideaToConfirm);
      setConfirmSuccess(true);
      setTimeout(() => setConfirmSuccess(false), 3000);
    } catch {
      // error handled in store
    }
  };

  // 处理创建作品
  const handleCreateProject = async () => {
    if (!draft) return;

    try {
      const result = await convertToProject(draft.id, {
        title: projectTitle || undefined,
        confirmedIdea: confirmedText || undefined,
      });
      if (result && result.id) {
        await openProject(result.id, result.title, navigate);
      }
    } catch {
      // error handled in store
    }
  };

  // 如果还在加载或没有 draftId
  if (!draftId) {
    return (
      <div style={pageStyles.container}>
        <div style={pageStyles.errorBox}>
          <h2>缺少草稿 ID</h2>
          <p>请从项目列表选择「从想法开始」来创建想法草稿。</p>
          <button style={pageStyles.backBtn} onClick={() => navigate('/')}>
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  if (loading && !draft) {
    return (
      <div style={pageStyles.container}>
        <div style={pageStyles.loadingBox}>
          <div style={pageStyles.spinner} />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div style={pageStyles.container}>
        <div style={pageStyles.errorBox}>
          <h2>加载失败</h2>
          <p>{error}</p>
          <button style={pageStyles.backBtn} onClick={() => navigate('/')}>
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  // 判断当前可用的操作
  const isDraft = draft.status === 'draft';
  const hasQuestions = draft.questions && draft.questions.length > 0;
  const hasAnswers = draft.answers && draft.answers.length > 0;
  const isRefined = draft.status === 'refined' || draft.status === 'confirmed' || draft.status === 'converted';
  const hasRefinedIdea = draft.refinedIdea && draft.refinedIdea.oneLineHook;
  const isConfirmed = draft.status === 'confirmed' || draft.status === 'converted';
  const isConverted = draft.status === 'converted';

  return (
    <div style={pageStyles.container}>
      {/* 顶部信息区 */}
      <div style={pageStyles.header}>
        <button style={pageStyles.backBtn} onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div style={pageStyles.headerContent}>
          <h1 style={pageStyles.pageTitle}>想法孵化</h1>
          <div style={pageStyles.badges}>
            <span style={pageStyles.badge}>
              {TYPE_LABELS[draft.projectType] || draft.projectType}
            </span>
            <span style={pageStyles.badge}>
              {PLATFORM_LABELS[draft.targetPlatform] || draft.targetPlatform}
            </span>
            <span
              style={{
                ...pageStyles.badge,
                backgroundColor: STATUS_COLORS[draft.status] || '#6c6c80',
                color: '#fff',
              }}
            >
              {STATUS_LABELS[draft.status] || draft.status}
            </span>
            {isConverted && (
              <span style={{ ...pageStyles.badge, backgroundColor: '#2ecc71', color: '#fff' }}>
                已创建项目
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 原始想法卡片 */}
      <div style={pageStyles.rawIdeaCard}>
        <h3 style={pageStyles.rawIdeaLabel}>📝 原始想法</h3>
        <p style={pageStyles.rawIdeaText}>{draft.rawIdea}</p>
      </div>

      {/* Fallback 提示 */}
      {(questionsIsFallback || refineIsFallback) && (
        <div style={pageStyles.fallbackBanner}>
          ℹ️ 当前使用本地兜底结果，可稍后重新生成。
        </div>
      )}

      {/* 追问区 */}
      {hasQuestions && (
        <QuestionsSection
          questions={draft.questions}
          answers={localAnswers}
          onAnswerChange={handleAnswerChange}
        />
      )}

      {/* 完善版想法区 */}
      {hasRefinedIdea && (
        <RefinedIdeaSection refinedIdea={draft.refinedIdea} />
      )}

      {/* 成熟度评分区 */}
      {isRefined && draft.maturityReport && (
        <MaturitySection score={draft.maturityScore} report={draft.maturityReport} />
      )}

      {/* 确认想法区 */}
      {isRefined && !isConfirmed && (
        <ConfirmSection
          value={confirmedText}
          onValueChange={setConfirmedText}
        />
      )}

      {/* 已确认提示 */}
      {isConfirmed && !isConverted && (
        <div style={sectionStyles.container}>
          <div style={pageStyles.confirmedBanner}>
            ✅ 想法已确认
          </div>
          <div style={pageStyles.confirmedIdeaBox}>
            <p style={pageStyles.confirmedIdeaText}>{draft.confirmedIdea}</p>
          </div>
        </div>
      )}

      {/* 低分警告 */}
      {showLowScoreWarning && (
        <div style={pageStyles.warningBox}>
          <p>
            ⚠️ 当前想法成熟度评分较低（{draft.maturityScore} 分），建议继续完善后再确认。
          </p>
          <div style={pageStyles.warningActions}>
            <button
              style={pageStyles.secondaryBtn}
              onClick={() => setShowLowScoreWarning(false)}
            >
              继续完善
            </button>
            <button
              style={pageStyles.dangerBtn}
              onClick={() => {
                setShowLowScoreWarning(false);
                handleConfirm();
              }}
            >
              仍然确认
            </button>
          </div>
        </div>
      )}

      {/* 项目标题设置 */}
      {isConfirmed && !isConverted && (
        <div style={sectionStyles.container}>
          <div style={pageStyles.field}>
            <label style={pageStyles.fieldLabel}>作品标题</label>
            <input
              style={pageStyles.fieldInput}
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="输入作品标题..."
            />
          </div>
        </div>
      )}

      {/* 底部操作区 */}
      <div style={pageStyles.actions}>
        {/* 显示操作提示 */}
        {error && (
          <div style={pageStyles.errorMessage}>
            ❌ {error}
          </div>
        )}
        {saveSuccess && (
          <div style={pageStyles.successMessage}>
            ✅ 回答已保存
          </div>
        )}
        {confirmSuccess && (
          <div style={pageStyles.successMessage}>
            ✅ 想法已确认
          </div>
        )}

        <div style={pageStyles.actionRow}>
          {/* 草稿状态：生成追问 */}
          {isDraft && !hasQuestions && (
            <button
              style={pageStyles.primaryBtn}
              onClick={() => generateQuestions(draft.id)}
              disabled={loading}
            >
              {loading ? '生成中...' : '💡 生成追问'}
            </button>
          )}

          {/* 已生成追问：保存回答 */}
          {hasQuestions && !isRefined && (
            <>
              <button
                style={pageStyles.secondaryBtn}
                onClick={handleSaveAnswers}
                disabled={loading}
              >
                {loading ? '保存中...' : '💾 保存回答'}
              </button>
              <button
                style={pageStyles.primaryBtn}
                onClick={handleRefine}
                disabled={loading || localAnswers.filter((a) => a.answer.trim()).length === 0}
              >
                {loading ? '完善中...' : '✨ 完善想法'}
              </button>
            </>
          )}

          {/* 已完善：确认想法 */}
          {isRefined && !isConfirmed && (
            <button
              style={pageStyles.primaryBtn}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? '确认中...' : '✅ 确认想法'}
            </button>
          )}

          {/* 已确认：创建作品 */}
          {isConfirmed && !isConverted && (
            <button
              style={pageStyles.createBtn}
              onClick={handleCreateProject}
              disabled={loading || !projectTitle.trim()}
            >
              {loading ? '创建中...' : '🚀 创建作品'}
            </button>
          )}

          {/* 已转换：查看项目 */}
          {isConverted && draft.convertedProjectId && (
            <button
              style={pageStyles.primaryBtn}
              onClick={() => navigate(`/project/${draft.convertedProjectId}/dashboard`)}
            >
              查看项目
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ========== 样式 ==========

const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  header: {
    marginBottom: '24px',
  },
  headerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-text-primary, #eaeaea)',
    margin: 0,
  },
  badges: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  badge: {
    padding: '3px 10px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: 'var(--color-text-secondary, #a0a0b0)',
  },
  rawIdeaCard: {
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '20px',
    marginBottom: '16px',
  },
  rawIdeaLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-secondary, #a0a0b0)',
    margin: '0 0 8px 0',
  },
  rawIdeaText: {
    fontSize: '15px',
    color: 'var(--color-text-primary, #eaeaea)',
    lineHeight: 1.6,
    margin: 0,
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 0',
    color: 'var(--color-text-muted, #6c6c80)',
    gap: '16px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: 'var(--color-accent, #e94560)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorBox: {
    textAlign: 'center',
    padding: '60px 0',
    color: 'var(--color-text-muted, #6c6c80)',
  },
  confirmedBanner: {
    padding: '12px 16px',
    backgroundColor: 'rgba(46,204,113,0.1)',
    border: '1px solid rgba(46,204,113,0.3)',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#2ecc71',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  confirmedIdeaBox: {
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '16px',
  },
  confirmedIdeaText: {
    fontSize: '14px',
    color: 'var(--color-text-primary, #eaeaea)',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  warningBox: {
    backgroundColor: 'rgba(243,156,18,0.1)',
    border: '1px solid rgba(243,156,18,0.3)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: '16px',
    marginBottom: '16px',
  },
  warningActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldLabel: {
    fontSize: '13px',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontWeight: 500,
  },
  fieldInput: {
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
  },
  actions: {
    marginTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  actionRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  errorMessage: {
    padding: '8px 12px',
    backgroundColor: 'rgba(233,69,96,0.1)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: '#e94560',
    fontSize: '13px',
  },
  successMessage: {
    padding: '8px 12px',
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: '#2ecc71',
    fontSize: '13px',
  },
  primaryBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-accent, #e94560)',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  secondaryBtn: {
    padding: '10px 24px',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  dangerBtn: {
    padding: '10px 24px',
    backgroundColor: 'rgba(233,69,96,0.2)',
    border: '1px solid #e94560',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#e94560',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
  },
  createBtn: {
    padding: '12px 32px',
    backgroundColor: '#2ecc71',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    transition: 'background-color 0.15s',
  },
  backBtn: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-secondary, #a0a0b0)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'var(--font-family, sans-serif)',
    marginBottom: '12px',
  },
  fallbackBanner: {
    padding: '10px 16px',
    backgroundColor: 'rgba(243,156,18,0.1)',
    border: '1px solid rgba(243,156,18,0.3)',
    borderRadius: 'var(--radius-md, 8px)',
    color: '#f39c12',
    fontSize: '13px',
    marginBottom: '16px',
  },
};

const sectionStyles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderRadius: 'var(--radius-lg, 12px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '20px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #eaeaea)',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted, #6c6c80)',
    margin: '0 0 16px 0',
    lineHeight: 1.4,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px solid var(--color-border, #2a2a4a)',
    padding: '14px',
  },
  questionHeader: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
    marginBottom: '6px',
  },
  questionNumber: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-accent, #e94560)',
    flexShrink: 0,
    marginTop: '2px',
  },
  questionText: {
    fontSize: '14px',
    color: 'var(--color-text-primary, #eaeaea)',
    fontWeight: 500,
    lineHeight: 1.4,
  },
  reason: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #6c6c80)',
    margin: '0 0 10px 18px',
    lineHeight: 1.4,
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    border: '1px solid var(--color-border, #2a2a4a)',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '13px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginTop: '4px',
  },
  confirmTextarea: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
    border: '1px solid var(--color-accent, #e94560)',
    borderRadius: 'var(--radius-md, 8px)',
    color: 'var(--color-text-primary, #eaeaea)',
    fontSize: '14px',
    fontFamily: 'var(--font-family, sans-serif)',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    lineHeight: 1.6,
  },
};

const refinedStyles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-muted, #6c6c80)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: '14px',
    color: 'var(--color-text-primary, #eaeaea)',
    lineHeight: 1.5,
    margin: 0,
  },
  tagList: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  tag: {
    padding: '3px 10px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: 'rgba(46,204,113,0.1)',
    color: '#2ecc71',
  },
};

const maturityStyles: Record<string, React.CSSProperties> = {
  scoreArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '20px',
  },
  scoreCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '3px solid #2ecc71',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreNumber: {
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1,
  },
  scoreUnit: {
    fontSize: '11px',
    opacity: 0.6,
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
  },
  listBlock: {
    marginBottom: '12px',
  },
  listTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary, #a0a0b0)',
    margin: '0 0 8px 0',
  },
  list: {
    margin: 0,
    padding: '0 0 0 20px',
  },
  listItem: {
    fontSize: '13px',
    lineHeight: 1.6,
    marginBottom: '4px',
  },
};

export default IdeaLabPage;
