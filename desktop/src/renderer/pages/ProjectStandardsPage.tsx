/**
 * ProjectStandardsPage - 项目执行标准
 *
 * 平台 / 分类 / 基调 / 文风 / 流派 / 视角 / 目标读者 是【执行前提】：
 * 框架层（世界观、人物、组织、地点、大纲、伏笔）与正文层都必须按这份标准执行，
 * 所以它们必须可以在创建项目之后被查看与补齐，而不是只在创建向导里出现一次。
 *
 * 为什么单独做一页：这些标准此前只能在创建向导里设置。向导里没选，项目就永远带着
 * 空标准跑；而空标准要等正文全部写完（实测约 10 分钟、十余次 LLM 调用）之后才被
 * 统一质量 Gate 当作 blocking 发现——成本最高的一步才发现「标准根本没设置」。
 * 本页把同一份标准放在生成之前，成本为 0 时可补齐。
 *
 * 不降级：任一必填维度为空都视为「未执行标准」，保存前就阻断并逐项列出；
 * 不填默认值、不用平台推荐替代、不静默变成 not_applicable。
 *
 * 表单与「创建作品」入口共用 components/ExecutionStandardsForm，判据共用
 * lib/executionStandards（与后端 missingConstitutionStandards 同源），两处不各写一套。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { mapServerProject, useProjectStore } from '../stores/projectStore';
import ExecutionStandardsForm from '../components/ExecutionStandardsForm';
import {
  EMPTY_EXECUTION_STANDARDS,
  missingExecutionStandards,
  targetWordsBlockingReason,
  toExecutionStandardsPayload,
  toStandardsTags,
  type ExecutionStandardsValue,
} from '../lib/executionStandards';

const ProjectStandardsPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const updateProject = useProjectStore((state) => state.updateProject);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [standards, setStandards] = useState<ExecutionStandardsValue>(EMPTY_EXECUTION_STANDARDS);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api.get<any>(`/projects/${id}`)
      .then((res) => {
        if (cancelled) return;
        const raw = (res as any)?.data ?? res;
        const project = mapServerProject(raw);
        const c = project.creativeConstitution || ({} as any);
        setProjectTitle(project.title);
        setStandards({
          targetPlatform: String(c.targetPlatform || ''),
          customPlatformNote: String(c.customPlatformNote || ''),
          category: String(c.category || ''),
          storyTone: Array.isArray(c.storyTone) ? c.storyTone.map(String) : [],
          writingStyle: toStandardsTags(c.writingStyle),
          webNovelGenre: Array.isArray(c.webNovelGenre) ? c.webNovelGenre.map(String) : [],
          submissionTags: Array.isArray(c.submissionTags) ? c.submissionTags.map(String) : [],
          plotTags: Array.isArray(c.plotTags) ? c.plotTags.map(String) : [],
          genreFitNote: String(c.genreFitNote || ''),
          // 目标总字数是「分类」维的平台侧判据输入：0/空 = 未设定，不是「不适用」。
          targetWords: Number(c.targetWords) > 0 ? String(c.targetWords) : '',
          // 成稿单元（项目类型）是「分类」维体量判据的适用前提：漏传会被按「未知即从严」处理，
          // 合规短篇会在这里先被前端拦下（后端判据由此拿到 projectType 才认得出短篇）。
          projectType: String(project.type || ''),
          pov: String(c.pov || ''),
          targetAudience: typeof c.targetAudience === 'string' ? c.targetAudience : '',
          categoryWordScaleDeviation: String(c.categoryWordScaleDeviation || ''),
        });
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setLoadError(err?.message || '加载项目失败');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const missingDimensions = useMemo(() => missingExecutionStandards(standards), [standards]);
  // 「分类」维目标总字数的确定性判据（与后端同一份数据）：非 null 即该维未执行，保存前阻断。
  const targetWordsBlock = useMemo(() => targetWordsBlockingReason(standards), [standards]);
  const blocked = missingDimensions.length > 0 || Boolean(targetWordsBlock);

  const handleSave = useCallback(async () => {
    setSaveError('');
    setSavedAt('');
    if (!id) return;
    if (missingDimensions.length > 0) {
      setSaveError(`以下执行标准仍为空：${missingDimensions.join('、')}。空值等于这项标准不存在，必须补齐后再保存——不会用默认值或平台推荐替代。`);
      return;
    }
    // 「分类」维目标总字数与六维缺项一样，必须在写库之前阻断：
    // 保存成功之后再暴露，作者会以为标准已经生效，直到正文全部生成后才被 Gate 拦下。
    if (targetWordsBlock) {
      setSaveError(`未执行标准（分类）：${targetWordsBlock}`);
      return;
    }
    setSaving(true);
    try {
      // 不再把 targetPlatform 收窄成 TargetPlatform：载荷就是执行标准本体，
      // 前端复制一份枚举只会多一处需要跟着平台目录改的地方。
      const saved = await updateProject(id, toExecutionStandardsPayload(standards));
      const c = saved.creativeConstitution;
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setSaveError(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [id, missingDimensions, targetWordsBlock, standards, updateProject]);

  if (loading) {
    return <div style={s.page}>正在加载项目执行标准…</div>;
  }

  if (loadError) {
    return (
      <div style={s.page}>
        <div style={s.errorBox}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>无法加载项目执行标准</div>
          <div>{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>本书创作设定</div>
        <div style={s.subtitle}>
          {projectTitle}
        </div>
      </div>

      {targetWordsBlock && (
        <div style={s.blockingBox}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>未执行标准（分类）</div>
          <div>{targetWordsBlock}</div>
        </div>
      )}

      {missingDimensions.length > 0 && (
        <div style={s.blockingBox}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>
            未执行标准：{missingDimensions.join('、')}
          </div>
        </div>
      )}

      <ExecutionStandardsForm
        value={standards}
        onChange={(next) => { setStandards(next); setSaveError(''); }}
        disabled={saving}
        heading="平台与创作方向"
      />

      {saveError && <div style={s.errorBox}>{saveError}</div>}
      {savedAt && (
        <div style={s.successBox}>
          已保存（{savedAt}）。已有内容若需采用新设定，请重新生成：
          <Link to={`/project/${id}/outline`} style={{ color: 'var(--color-accent)', marginLeft: '4px' }}>前往大纲</Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
        <button
          onClick={handleSave}
          disabled={saving || blocked}
          style={{ ...s.primaryBtn, opacity: saving || blocked ? 0.5 : 1, cursor: saving || blocked ? 'not-allowed' : 'pointer' }}
        >
          {saving ? '保存中…' : '保存本书设定'}
        </button>
        <Link to={`/project/${id}/dashboard`} style={s.secondaryBtn}>返回项目首页</Link>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px', maxWidth: '860px', margin: '0 auto', color: 'var(--color-text-primary)' },
  header: { marginBottom: '20px' },
  title: { fontSize: '20px', fontWeight: 700 },
  subtitle: { marginTop: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  blockingBox: {
    marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
    border: '1px solid rgba(248,81,73,0.45)', backgroundColor: 'rgba(248,81,73,0.10)',
    color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.7,
  },
  errorBox: {
    marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
    border: '1px solid rgba(248,81,73,0.45)', backgroundColor: 'rgba(248,81,73,0.10)',
    fontSize: 'var(--font-size-xs)', lineHeight: 1.7,
  },
  successBox: {
    marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
    border: '1px solid rgba(63,185,80,0.45)', backgroundColor: 'rgba(63,185,80,0.10)',
    fontSize: 'var(--font-size-xs)', lineHeight: 1.7,
  },
  primaryBtn: {
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    backgroundColor: 'var(--color-accent)', color: '#fff',
    fontSize: 'var(--font-size-sm)', fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: '8px', textDecoration: 'none',
    border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-secondary)',
    fontSize: 'var(--font-size-sm)',
  },
};

export default ProjectStandardsPage;
