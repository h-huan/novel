/**
 * RefinementPage - 精修工具面板
 * 对接后端 /refinement/* 完整API
 * 整合: 精修模板/去AI味/Describe逐句精修/错别字/敏感词/版权检测
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface ToolTab {
  id: string; label: string; icon: string;
  // projectScoped：该端点必须携带 projectId 才能按项目执行标准执行（服务端会据此解析平台/分类/基调/文风/流派/视角）
  endpoints: { label: string; method: 'get' | 'post'; path: string; body?: any; projectScoped?: boolean }[];
  desc: string;
}

const TOOLS: ToolTab[] = [
  { id: 'templates', label: '精修模板', icon: '✨',
    endpoints: [
      { label: '获取模板列表(按执行标准标注)', method: 'get', path: '/refinement/templates', projectScoped: true },
      { label: '获取分类', method: 'get', path: '/refinement/templates/categories' },
      { label: '应用模板', method: 'post', path: '/refinement/templates/apply', body: { templateId: '', chapterId: '', content: '', projectId: '' } },
    ], desc: '21套精修模板：清单按本项目执行标准（平台/分类/基调/文风/流派/视角）标注可用性，冲突模板不可执行' },
  { id: 'deai', label: '去AI味', icon: '🧹',
    endpoints: [
      { label: 'AI痕迹检测', method: 'post', path: '/refinement/de-ai/detect', body: { content: '' } },
      { label: '正则降AI处理', method: 'post', path: '/refinement/de-ai/polish', body: { content: '', intensity: 50 } },
      { label: 'LLM局部改写(推荐)', method: 'post', path: '/refinement/de-ai/llm-rewrite', body: { content: '', maxRewrites: 3, projectId: '' }, projectScoped: true },
    ], desc: 'AI痕迹检测+正则降AI+LLM局部改写(只改问题段落，不破坏全文逻辑)' },
  { id: 'describe', label: '逐句精修', icon: '🎨',
    endpoints: [
      { label: '可用风格(按执行标准)', method: 'get', path: '/refinement/describe/styles', projectScoped: true },
      { label: '精修句子', method: 'post', path: '/refinement/describe/polish', body: { sentence: '', projectId: '', styles: ['standard'], variants: 3 } },
    ], desc: '选中句子→选择风格→AI生成3个变体' },
  { id: 'spell', label: '错别字', icon: '🔤',
    endpoints: [
      { label: '检查', method: 'post', path: '/refinement/spell-check/check', body: { content: '' } },
      { label: '自动修复', method: 'post', path: '/refinement/spell-check/auto-fix', body: { content: '' } },
      { label: '批量修复', method: 'post', path: '/refinement/spell-check/batch-fix', body: { fixes: [] } },
    ], desc: '5000+词库+实时检测+批量修正' },
  { id: 'sensitive', label: '敏感词', icon: '⚠️',
    endpoints: [
      { label: '获取分类', method: 'get', path: '/refinement/sensitive/categories' },
      { label: '检测', method: 'post', path: '/refinement/sensitive/check', body: { content: '' } },
      { label: '处理替换', method: 'post', path: '/refinement/sensitive/process', body: { content: '', replacements: [] } },
      { label: 'AI上下文检测', method: 'post', path: '/refinement/sensitive/ai-context', body: { content: '' } },
    ], desc: '精确/模糊/AI三级检测+多平台过审配置' },
  { id: 'copyright', label: '版权', icon: '©️',
    endpoints: [
      { label: '版权检测', method: 'post', path: '/refinement/copyright/check', body: { title: '', content: '', characterNames: [] } },
    ], desc: '标题/内容/角色名三重检测+红黄绿风险分级' },
  { id: 'quality', label: '质检', icon: '🔍',
    endpoints: [
      { label: '内容质检', method: 'post', path: '/refinement/quality/inspect', body: { content: '' } },
      { label: '逻辑检测', method: 'post', path: '/refinement/quality/logic', body: { content: '' } },
      { label: '人设漂移', method: 'post', path: '/refinement/quality/character-drift', body: { content: '', characterId: '' } },
      { label: '伏笔一致性', method: 'post', path: '/refinement/quality/foreshadowing', body: { content: '' } },
    ], desc: '内容质检/逻辑检查/人设漂移/伏笔一致性' },
];

interface ChapterInfo {
  id: string;
  index: number;
  title: string;
  status: string;
}

const RefinementPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTool, setActiveTool] = useState('templates');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [intensity, setIntensity] = useState(50);
  const [activeEndpoint, setActiveEndpoint] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [batchTemplate, setBatchTemplate] = useState('concise');
  const [batchStatus, setBatchStatus] = useState('');
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [standardTemplates, setStandardTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    const loadChapters = async () => {
      setChaptersLoading(true);
      try {
        const res = await api.get<any[]>(`/projects/${projectId}/chapters`);
        const chs = (res.data || []).map((ch: any, idx: number) => ({
          id: ch.id,
          index: ch.chapterNumber || idx + 1,
          title: ch.title || `第${idx + 1}章`,
          status: ch.status || 'draft',
        }));
        setChapters(chs);
      } catch (err) {
        console.error('获取章节列表失败:', err);
      } finally {
        setChaptersLoading(false);
      }
    };
    loadChapters();
  }, [projectId]);

  // 批量模板下拉必须来自服务端按【本项目执行标准】判定后的清单：
  // 与标准冲突的模板（如都市白描下的「古风版」）后端标 applicable=false，
  // 界面不得再写死一份通用选项，否则作者选定的平台/基调/文风又被绕过去了。
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const loadTemplates = async () => {
      setTemplatesLoading(true);
      setTemplatesError('');
      try {
        const res = await api.get<any[]>(`/refinement/templates?projectId=${encodeURIComponent(projectId)}`);
        const list = Array.isArray(res.data) ? res.data : [];
        if (!alive) return;
        setStandardTemplates(list);
        const usable = list.filter((t: any) => t.applicable);
        if (usable.length > 0) {
          setBatchTemplate((prev: string) => (usable.some((t: any) => t.id === prev) ? prev : usable[0].id));
        }
      } catch (err: any) {
        if (alive) setTemplatesError(err?.message || '模板清单加载失败');
      } finally {
        if (alive) setTemplatesLoading(false);
      }
    };
    loadTemplates();
    return () => { alive = false; };
  }, [projectId]);

  const tool = TOOLS.find(t => t.id === activeTool)!;
  const ep = tool?.endpoints[activeEndpoint];

  const callApi = useCallback(async () => {
    if (!ep) return;
    setLoading(true); setResult(null);
    try {
      let body: any = {};
      if (ep.body) {
        body = { ...ep.body };
        if (body.content !== undefined) body.content = content;
        // 逐句精修的后端字段是 sentence（旧前端传 text/style，后端收不到，等于空转）
        if (body.sentence !== undefined) body.sentence = content;
        if (body.intensity !== undefined) body.intensity = intensity;
        // 项目内场景（精修）必须带 projectId：后端 beginRun 对缺 projectId 的项目内场景直接阻断，
        // 不再静默退化成平台级记录。这里从路由参数取，作为唯一来源。
        if (body.projectId !== undefined) body.projectId = projectId || '';
      }
      // projectScoped 的 GET 也必须带 projectId：执行标准由服务端按项目解析，
      // 不带就等于在无标准下取回一份与本书无关的通用清单。
      const path = ep.method === 'get' && ep.projectScoped
        ? `${ep.path}${ep.path.includes('?') ? '&' : '?'}projectId=${encodeURIComponent(projectId || '')}`
        : ep.path;
      const res = ep.method === 'get'
        ? await api.get(path)
        : await api.post(path, body);
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.message || '请求失败' });
    }
    setLoading(false);
  }, [ep, content, intensity, projectId]);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        🛠️ 精修工具
        <button onClick={() => { setBatchMode(p => !p); setResult(null); setBatchStatus(''); }}
          style={{ marginLeft: '12px', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontSize: '14px', backgroundColor: batchMode ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)', borderColor: batchMode ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)', color: batchMode ? 'var(--color-accent)' : 'var(--color-text-dim)' }}>
          {batchMode ? '📦 批量模式 (开)' : '📦 批量模式'}
        </button>
      </h1>

      {batchMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-soft)' }}>📦 批量精修 · 选择章节和模板</div>
          {chaptersLoading ? (
            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>加载章节中...</div>
          ) : chapters.length === 0 ? (
            <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>暂无章节数据</div>
          ) : (
          <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {chapters.map(ch => (
              <button key={ch.index} onClick={() => setSelectedChapters(p => p.includes(ch.index) ? p.filter(i => i !== ch.index) : [...p, ch.index])}
                style={{
                  padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontSize: '14px', transition: 'all 0.1s',
                  backgroundColor: selectedChapters.includes(ch.index) ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
                  borderColor: selectedChapters.includes(ch.index) ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                  color: ch.status === 'locked' ? 'var(--color-danger)' : selectedChapters.includes(ch.index) ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  opacity: ch.status === 'locked' ? 0.6 : 1,
                  textDecoration: ch.status === 'locked' ? 'line-through' : 'none',
                }}>
                {ch.title} {ch.status === 'locked' ? '🔒' : ch.status === 'draft' ? '📝' : '✅'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>模板:</span>
            <select value={batchTemplate} onChange={e => setBatchTemplate(e.target.value)}
              style={{ padding: '5px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}>
              {standardTemplates.filter(t => t.applicable).map(t => (
                <option key={t.id} value={t.id}>{t.name}（强化方向：{t.axisLabel}）</option>
              ))}
              {standardTemplates.filter(t => !t.applicable).map(t => (
                <option key={t.id} value={t.id} disabled>{t.name}（与执行标准冲突，不可选）</option>
              ))}
            </select>
            <button onClick={async () => {
              if (selectedChapters.length === 0) { setBatchStatus('⚠️ 请选择至少1个章节'); return; }
              setBatchStatus(`⏳ 正在处理 ${selectedChapters.length} 章...`);
              setLoading(true);
              let done = 0; let skipped = 0;
              try {
                // 真批量精修：读章节正文 → 应用模板改写 → 写回章节。
                // 失败/无改动一律计数并回报，绝不用空转冒充「已完成 N 章」。
                const failures: string[] = [];
                for (const chId of selectedChapters) {
                  const chData = chapters.find(c => c.index === chId);
                  if (chData?.status === 'locked') { skipped++; continue; }
                  const chLabel = chData?.title || String(chId);
                  try {
                    const detail = await api.get<any>(`/projects/${projectId}/chapters/${chData?.id}`);
                    const original = String(detail?.data?.content ?? '');
                    if (!original.trim()) { failures.push(`${chLabel}: 章节无正文`); continue; }
                    const applied = await api.post<any>('/refinement/templates/apply', { templateId: batchTemplate, content: original, projectId });
                    const refined = String(applied?.data?.result ?? '');
                    if (!refined.trim()) { failures.push(`${chLabel}: 模板未返回结果`); continue; }
                    if (refined === original) { failures.push(`${chLabel}: 模板未产生改动`); continue; }
                    await api.put(`/projects/${projectId}/chapters/${chData?.id}`, { content: refined });
                    done++;
                  } catch (err: any) {
                    failures.push(`${chLabel}: ${err?.message || '精修失败'}`);
                  }
                }
                if (failures.length > 0) {
                  setBatchStatus(`⚠️ 完成 ${done}章，跳过 ${skipped}章已锁定，${failures.length}章未完成：${failures.slice(0, 3).join('；')}${failures.length > 3 ? ' 等' : ''}`);
                } else {
                  setBatchStatus(`✅ 完成: ${done}章精修, 跳过 ${skipped}章已锁定`);
                }
              } catch { setBatchStatus('❌ 批量精修失败'); }
              setLoading(false);
              setTimeout(() => setBatchStatus(''), 3000);
            }} disabled={loading}
              style={{ padding: '6px 14px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '5px', color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? '处理中...' : `🚀 应用精修 (${selectedChapters.length}章)`}
            </button>
          </div>
          {templatesLoading && <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>⏳ 正在按本项目执行标准加载模板清单...</div>}
          {templatesError && <div style={{ fontSize: '14px', color: 'var(--color-danger)' }}>❌ 模板清单加载失败：{templatesError}（未按标准判定前不得批量执行）</div>}
          {!templatesLoading && !templatesError && standardTemplates.some(t => !t.applicable) && (
            <div style={{ fontSize: '13px', color: 'var(--color-text-dim)', lineHeight: 1.6 }}>
              🚫 已按执行标准过滤 {standardTemplates.filter(t => !t.applicable).length} 个冲突模板：
              {standardTemplates.filter(t => !t.applicable).map(t => `${t.name}（${t.rejectReason}）`).join('；')}
            </div>
          )}
          {batchStatus && <div style={{ fontSize: '14px', color: batchStatus.startsWith('✅') ? 'var(--color-success)' : batchStatus.startsWith('⚠️') ? 'var(--color-warning)' : 'var(--color-danger)' }}>{batchStatus}</div>}
        </>
        )}
        </div>
        )}

      {/* 工具Tab */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => { setActiveTool(t.id); setActiveEndpoint(0); setResult(null); }}
            style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid',
              backgroundColor: activeTool === t.id ? 'rgba(233,69,96,0.12)' : 'rgba(255,255,255,0.02)',
              borderColor: activeTool === t.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)', color: activeTool === t.id ? 'var(--color-accent)' : 'var(--color-text-soft)',
              fontSize: '14px', fontWeight: 500,
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>{tool?.desc}</p>

      {/* 输入区 */}
      {(activeTool !== 'templates') && (
        <textarea value={content} onChange={e => setContent(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
            outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '120px',
          }} placeholder="输入需要处理的文本..." />
      )}

      {/* 去AI味滑块 */}
      {activeTool === 'deai' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>降AI力度:</span>
          <input type="range" min={10} max={90} value={intensity} onChange={e => setIntensity(parseInt(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ fontSize: '14px', color: intensity > 70 ? 'var(--color-danger)' : intensity > 40 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600 }}>
            {intensity < 30 ? '轻度' : intensity < 60 ? '中度' : '重度'} ({intensity}%)
          </span>
        </div>
      )}

      {/* 端点选择按钮 */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {tool?.endpoints.map((e, i) => (
          <button key={i} onClick={() => { setActiveEndpoint(i); setResult(null); }}
            style={{
              padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid', fontSize: '14px',
              backgroundColor: activeEndpoint === i ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
              borderColor: activeEndpoint === i ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
              color: activeEndpoint === i ? 'var(--color-accent)' : 'var(--color-text-dim)',
            }}>{e.label}</button>
        ))}
      </div>

      {/* 执行按钮 */}
      <button onClick={callApi} disabled={loading}
        style={{
          padding: '10px 24px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '8px',
          color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', width: 'fit-content', opacity: loading ? 0.6 : 1,
        }}>{loading ? '调用中...' : `▶ 调用 ${ep?.path || ''}`}</button>

      {/* 结果 - 可视化展示 */}
      {result && (
        <div style={{
          padding: '14px', backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px', fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.6, overflow: 'auto', maxHeight: '400px',
        }}>
          {/* 根据工具类型可视化展示结果 */}
          {activeTool === 'proofread' && result.errors && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '8px' }}>
                ❌ 发现 {result.errors.length} 个错别字
              </div>
              {result.errors.map((err: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 10px', backgroundColor: 'rgba(233,69,96,0.08)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(233,69,96,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{err.wrong}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{err.correct}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-dim)' }}>位置: {err.position}字</span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>建议: {err.suggestion}</div>
                </div>
              ))}
            </div>
          )}

          {activeTool === 'sensitive' && result.words && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '8px' }}>
                ⚠️ 发现 {result.words.length} 个敏感词
              </div>
              {result.words.map((word: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 10px', backgroundColor: 'rgba(243,156,18,0.08)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(243,156,18,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{word.word}</span>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: `rgba(${word.severity === 'high' ? '233,69,96' : word.severity === 'medium' ? '243,156,18' : '46,204,113'},0.2)`, color: word.severity === 'high' ? 'var(--color-accent)' : word.severity === 'medium' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {word.severity === 'high' ? '高危' : word.severity === 'medium' ? '中危' : '低危'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-dim)' }}>位置: {word.position}字</span>
                  </div>
                  {word.suggestion && (
                    <div style={{ fontSize: '14px', color: 'var(--color-success)' }}>建议替换为: {word.suggestion}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTool === 'ai-trace' && result.score !== undefined && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-purple)', marginBottom: '12px' }}>
                🤖 AI痕迹检测报告
              </div>
              {/* AI痕迹评分仪表盘 */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginBottom: '4px' }}>AI痕迹指数</div>
                    <div style={{ height: '24px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        height: '100%', width: `${result.score}%`,
                        background: result.score <= 25 ? 'linear-gradient(90deg, var(--color-success), var(--color-success))' :
                                   result.score <= 40 ? 'linear-gradient(90deg, var(--color-warning), var(--color-warning))' :
                                   'linear-gradient(90deg, var(--color-accent), var(--color-danger))',
                        borderRadius: '12px',
                        transition: 'width 0.5s ease-out',
                      }} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 700, color: 'var(--color-white)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        {result.score}%
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>
                  评级: <span style={{ color: result.score <= 25 ? 'var(--color-success)' : result.score <= 40 ? 'var(--color-warning)' : 'var(--color-accent)', fontWeight: 600 }}>
                    {result.score <= 25 ? '✅ 优秀 (AI痕迹低)' : result.score <= 40 ? '⚠️ 及格 (需优化)' : '❌ 不及格 (AI痕迹重)'}
                  </span>
                </div>
              </div>
              {/* 详细分析 */}
              {result.details && result.details.length > 0 && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>问题片段:</div>
                  {result.details.map((detail: any, idx: number) => (
                    <div key={idx} style={{ padding: '6px 8px', backgroundColor: 'rgba(155,89,182,0.08)', borderRadius: '4px', marginBottom: '4px', fontSize: '14px' }}>
                      <span style={{ color: 'var(--color-purple)' }}>{detail.type}</span>: {detail.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 其他工具：模板应用、版权审查、质检报告、批量模式 - 显示格式化的JSON */}
          {!['proofread', 'sensitive', 'ai-trace'].includes(activeTool) && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '14px' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default RefinementPage;
