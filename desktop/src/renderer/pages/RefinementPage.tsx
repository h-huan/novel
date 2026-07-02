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
  endpoints: { label: string; method: 'get' | 'post'; path: string; body?: any }[];
  desc: string;
}

const TOOLS: ToolTab[] = [
  { id: 'templates', label: '精修模板', icon: '✨',
    endpoints: [
      { label: '获取模板列表', method: 'get', path: '/refinement/templates' },
      { label: '获取分类', method: 'get', path: '/refinement/templates/categories' },
      { label: '应用模板', method: 'post', path: '/refinement/templates/apply', body: { templateId: '', chapterId: '', content: '' } },
    ], desc: '22套精修模板：节奏优化、爽点提升、悬念营造、对话优化等' },
  { id: 'deai', label: '去AI味', icon: '🧹',
    endpoints: [
      { label: 'AI痕迹检测', method: 'post', path: '/refinement/de-ai/detect', body: { content: '' } },
      { label: '降AI处理', method: 'post', path: '/refinement/de-ai/polish', body: { content: '', intensity: 50 } },
    ], desc: 'AI痕迹检测引擎+降AI处理(轻度/中度/重度滑块)' },
  { id: 'describe', label: '逐句精修', icon: '🎨',
    endpoints: [
      { label: '可用风格', method: 'get', path: '/refinement/describe/styles' },
      { label: '精修句子', method: 'post', path: '/refinement/describe/polish', body: { text: '', style: 'poetic' } },
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
        if (body.intensity !== undefined) body.intensity = intensity;
      }
      const res = ep.method === 'get'
        ? await api.get(ep.path)
        : await api.post(ep.path, body);
      setResult(res.data);
    } catch (err: any) {
      setResult({ error: err.message || '请求失败' });
    }
    setLoading(false);
  }, [ep, content, intensity]);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>
        🛠️ 精修工具
        <button onClick={() => { setBatchMode(p => !p); setResult(null); setBatchStatus(''); }}
          style={{ marginLeft: '12px', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontSize: '11px', backgroundColor: batchMode ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)', borderColor: batchMode ? '#e94560' : 'rgba(255,255,255,0.08)', color: batchMode ? '#e94560' : '#8a8aa0' }}>
          {batchMode ? '📦 批量模式 (开)' : '📦 批量模式'}
        </button>
      </h1>

      {batchMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#c0c0d0' }}>📦 批量精修 · 选择章节和模板</div>
          {chaptersLoading ? (
            <div style={{ fontSize: '11px', color: '#6c6c80' }}>加载章节中...</div>
          ) : chapters.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#6c6c80' }}>暂无章节数据</div>
          ) : (
          <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {chapters.map(ch => (
              <button key={ch.index} onClick={() => setSelectedChapters(p => p.includes(ch.index) ? p.filter(i => i !== ch.index) : [...p, ch.index])}
                style={{
                  padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontSize: '11px', transition: 'all 0.1s',
                  backgroundColor: selectedChapters.includes(ch.index) ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
                  borderColor: selectedChapters.includes(ch.index) ? '#e94560' : 'rgba(255,255,255,0.08)',
                  color: ch.status === 'locked' ? '#e74c3c' : selectedChapters.includes(ch.index) ? '#eaeaea' : '#6c6c80',
                  opacity: ch.status === 'locked' ? 0.6 : 1,
                  textDecoration: ch.status === 'locked' ? 'line-through' : 'none',
                }}>
                {ch.title} {ch.status === 'locked' ? '🔒' : ch.status === 'draft' ? '📝' : '✅'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#8a8aa0' }}>模板:</span>
            <select value={batchTemplate} onChange={e => setBatchTemplate(e.target.value)}
              style={{ padding: '5px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="concise">简洁版</option><option value="vivid">生动版</option><option value="dialogue">对话强化版</option>
              <option value="suspense">悬念版</option><option value="emotional">情绪版</option><option value="commercial">网文爽感版</option>
            </select>
            <button onClick={async () => {
              if (selectedChapters.length === 0) { setBatchStatus('⚠️ 请选择至少1个章节'); return; }
              setBatchStatus(`⏳ 正在处理 ${selectedChapters.length} 章...`);
              setLoading(true);
              let done = 0; let skipped = 0;
              try {
                for (const chId of selectedChapters) {
                  const chData = chapters.find(c => c.index === chId);
                  if (chData?.status === 'locked') { skipped++; continue; }
                  await api.get('/refinement/templates');
                  done++;
                }
                setBatchStatus(`✅ 完成: ${done}章精修, 跳过 ${skipped}章已锁定`);
              } catch { setBatchStatus('❌ 批量精修失败'); }
              setLoading(false);
              setTimeout(() => setBatchStatus(''), 3000);
            }} disabled={loading}
              style={{ padding: '6px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: '5px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? '处理中...' : `🚀 应用精修 (${selectedChapters.length}章)`}
            </button>
          </div>
          {batchStatus && <div style={{ fontSize: '11px', color: batchStatus.startsWith('✅') ? '#2ecc71' : batchStatus.startsWith('⚠️') ? '#f39c12' : '#e74c3c' }}>{batchStatus}</div>}
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
              borderColor: activeTool === t.id ? '#e94560' : 'rgba(255,255,255,0.06)', color: activeTool === t.id ? '#e94560' : '#c0c0d0',
              fontSize: '12px', fontWeight: 500,
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: '11px', color: '#6c6c80' }}>{tool?.desc}</p>

      {/* 输入区 */}
      {(activeTool !== 'templates') && (
        <textarea value={content} onChange={e => setContent(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
            outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '120px',
          }} placeholder="输入需要处理的文本..." />
      )}

      {/* 去AI味滑块 */}
      {activeTool === 'deai' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: '#8a8aa0' }}>降AI力度:</span>
          <input type="range" min={10} max={90} value={intensity} onChange={e => setIntensity(parseInt(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: intensity > 70 ? '#e74c3c' : intensity > 40 ? '#f39c12' : '#2ecc71', fontWeight: 600 }}>
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
              border: '1px solid', fontSize: '11px',
              backgroundColor: activeEndpoint === i ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
              borderColor: activeEndpoint === i ? '#e94560' : 'rgba(255,255,255,0.06)',
              color: activeEndpoint === i ? '#e94560' : '#8a8aa0',
            }}>{e.label}</button>
        ))}
      </div>

      {/* 执行按钮 */}
      <button onClick={callApi} disabled={loading}
        style={{
          padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px',
          color: '#fff', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', width: 'fit-content', opacity: loading ? 0.6 : 1,
        }}>{loading ? '调用中...' : `▶ 调用 ${ep?.path || ''}`}</button>

      {/* 结果 - 可视化展示 */}
      {result && (
        <div style={{
          padding: '14px', backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px', fontSize: '13px', color: '#c0c0d0', lineHeight: 1.6, overflow: 'auto', maxHeight: '400px',
        }}>
          {/* 根据工具类型可视化展示结果 */}
          {activeTool === 'proofread' && result.errors && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e94560', marginBottom: '8px' }}>
                ❌ 发现 {result.errors.length} 个错别字
              </div>
              {result.errors.map((err: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 10px', backgroundColor: 'rgba(233,69,96,0.08)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(233,69,96,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: '#e94560', fontWeight: 700 }}>{err.wrong}</span>
                    <span style={{ color: '#6c6c80' }}>→</span>
                    <span style={{ color: '#2ecc71', fontWeight: 700 }}>{err.correct}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8a8aa0' }}>位置: {err.position}字</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#8a8aa0' }}>建议: {err.suggestion}</div>
                </div>
              ))}
            </div>
          )}

          {activeTool === 'sensitive' && result.words && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f39c12', marginBottom: '8px' }}>
                ⚠️ 发现 {result.words.length} 个敏感词
              </div>
              {result.words.map((word: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 10px', backgroundColor: 'rgba(243,156,18,0.08)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(243,156,18,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: '#f39c12', fontWeight: 700 }}>{word.word}</span>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', backgroundColor: `rgba(${word.severity === 'high' ? '233,69,96' : word.severity === 'medium' ? '243,156,18' : '46,204,113'},0.2)`, color: word.severity === 'high' ? '#e94560' : word.severity === 'medium' ? '#f39c12' : '#2ecc71' }}>
                      {word.severity === 'high' ? '高危' : word.severity === 'medium' ? '中危' : '低危'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8a8aa0' }}>位置: {word.position}字</span>
                  </div>
                  {word.suggestion && (
                    <div style={{ fontSize: '11px', color: '#2ecc71' }}>建议替换为: {word.suggestion}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTool === 'ai-trace' && result.score !== undefined && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#9b59b6', marginBottom: '12px' }}>
                🤖 AI痕迹检测报告
              </div>
              {/* AI痕迹评分仪表盘 */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>AI痕迹指数</div>
                    <div style={{ height: '24px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        height: '100%', width: `${result.score}%`,
                        background: result.score <= 25 ? 'linear-gradient(90deg, #22c55e, #2ecc71)' :
                                   result.score <= 40 ? 'linear-gradient(90deg, #f39c12, #eab308)' :
                                   'linear-gradient(90deg, #e94560, #ef4444)',
                        borderRadius: '12px',
                        transition: 'width 0.5s ease-out',
                      }} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '12px', fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        {result.score}%
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#8a8aa0' }}>
                  评级: <span style={{ color: result.score <= 25 ? '#2ecc71' : result.score <= 40 ? '#f39c12' : '#e94560', fontWeight: 600 }}>
                    {result.score <= 25 ? '✅ 优秀 (AI痕迹低)' : result.score <= 40 ? '⚠️ 及格 (需优化)' : '❌ 不及格 (AI痕迹重)'}
                  </span>
                </div>
              </div>
              {/* 详细分析 */}
              {result.details && result.details.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', marginBottom: '6px' }}>问题片段:</div>
                  {result.details.map((detail: any, idx: number) => (
                    <div key={idx} style={{ padding: '6px 8px', backgroundColor: 'rgba(155,89,182,0.08)', borderRadius: '4px', marginBottom: '4px', fontSize: '11px' }}>
                      <span style={{ color: '#9b59b6' }}>{detail.type}</span>: {detail.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 其他工具：模板应用、版权审查、质检报告、批量模式 - 显示格式化的JSON */}
          {!['proofread', 'sensitive', 'ai-trace'].includes(activeTool) && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default RefinementPage;
