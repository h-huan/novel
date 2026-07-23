/**
 * SettingsPage - 系统设置
 * API Key管理 + Token Plan + 模式切换
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const PLAN_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek 按量', color: '#60a5fa' },
  { value: 'deepseek_bundle', label: 'DeepSeek Token包', color: '#3b82f6' },
  { value: 'ali_bailian', label: '阿里百炼 Token包', color: '#e94560' },
  { value: 'tencent_hunyuan', label: '腾讯混元 Token包', color: '#22c55e' },
  { value: 'openai_paygo', label: 'OpenAI 按量', color: '#10b981' },
  { value: 'openai_bundle', label: 'OpenAI Token包', color: '#059669' },
  { value: 'claude_paygo', label: 'Claude 按量', color: '#a855f7' },
  { value: 'gemini_free', label: 'Gemini 免费', color: '#f59e0b' },
  { value: 'other_bundle', label: '其他 Token包', color: '#6c6c80' },
];

const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState('byok');
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [model, setModel] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [plan, setPlan] = useState('deepseek');
  const [writingMode, setWritingMode] = useState('normal');
  const [savedKeys, setSavedKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sceneMappings, setSceneMappings] = useState<Record<string, Record<string, string>>>({});
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string; provider: string; configured?: boolean }>>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [capabilities, setCapabilities] = useState<{ writing?: { available?: boolean }; embedding?: { available?: boolean; reason?: string }; readyForFullSync?: boolean }>({});
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('https://api.openai.com/v1');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');
  const [embeddingConfigured, setEmbeddingConfigured] = useState(false);
  // 偏好设置
  const [autoSaveInterval, setAutoSaveInterval] = useState(() => localStorage.getItem('prefs_autoSave') || '30');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('prefs_fontSize') || '15');
  const [writingStyle, setWritingStyle] = useState(() => localStorage.getItem('prefs_writingStyle') || 'semi_auto');

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  // 获取模型列表
  const fetchModels = useCallback(async () => {
    setIsFetchingModels(true);
    try {
      const res: any = await api.get('/routing/models');
      const configModels = res?.data?.models || res?.models || [];
      let providerModels: any[] = [];
      try {
        const res2: any = await api.get('/routing/all-available-models');
        const providers = res2?.data?.providers || res2?.providers || [];
        for (const p of providers) { if (p.models) providerModels.push(...p.models); }
      } catch {}
      const merged = new Map<string, any>();
      for (const m of [...configModels, ...providerModels]) {
        if (m?.id) merged.set(m.id, { ...merged.get(m.id), ...m });
      }
      const models = Array.from(merged.values());
      setFetchedModels(models);
      if (models.length > 0) {
        showMessage(`✅ 已获取 ${models.length} 个模型`);
      }
    } catch {
      try {
        const res2: any = await api.get('/routing/all-available-models');
        const providers = res2?.data?.providers || res2?.providers || [];
        if (providers.length > 0) {
          const all: any[] = [];
          for (const p of providers) { if (p.models) all.push(...p.models); }
          setFetchedModels(all);
          showMessage(`✅ 已获取 ${all.length} 个模型（从提供商 API）`);
        }
      } catch {}
    }
    setIsFetchingModels(false);
  }, [showMessage]);

  // 初始化：只挂载时执行一次
  useEffect(() => {
    loadKeys();
    // 获取当前模式
    api.get('/routing/mode').then((res: any) => {
      const mode = res?.data?.mode || res?.mode;
      if (mode) setWritingMode(mode);
    }).catch(() => {});
    // 自动获取模型列表
    fetchModels();
    api.get('/routing/capabilities').then((res: any) => {
      setCapabilities(res?.data || res || {});
    }).catch(() => {});
    api.get('/routing/embedding-config').then((res: any) => {
      const data = res?.data || res || {};
      setEmbeddingConfigured(Boolean(data.configured));
      if (data.baseUrl) setEmbeddingBaseUrl(data.baseUrl);
      if (data.model) setEmbeddingModel(data.model);
    }).catch(() => {});
    // 获取场景模型配置
    api.get('/routing/scenario-models').then((res: any) => {
      const data = res?.data || res || {};
      const mappings: Record<string, Record<string, string>> = {};
      // 后端返回 { scenes: { "idea_generate:economy": "modelId", ... } }
      const scenes = data.scenes || data;
      if (scenes && typeof scenes === 'object') {
        for (const [key, val] of Object.entries(scenes)) {
          // 扁平 key "场景:mode" → 嵌套
          const colonIdx = key.lastIndexOf(':');
          if (colonIdx > 0 && typeof val === 'string') {
            const sceneKey = key.substring(0, colonIdx);
            const mode = key.substring(colonIdx + 1);
            if (!mappings[sceneKey]) mappings[sceneKey] = {};
            mappings[sceneKey][mode] = val;
          } else if (typeof val === 'string' && !key.includes(':')) {
            // 兼容旧格式（无冒号的纯场景名）
            if (!mappings[key]) mappings[key] = {};
            mappings[key].economy = val;
            mappings[key].normal = val;
            mappings[key].premium = val;
          } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            // 已经是嵌套格式
            mappings[key] = val as Record<string, string>;
          }
        }
      }
      if (Object.keys(mappings).length > 0) setSceneMappings(mappings);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadKeys = async () => {
    try {
      const res: any = await api.get('/routing/keys');
      setSavedKeys(res?.data?.keys || res?.keys || []);
    } catch {}
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) { showMessage('请输入API Key'); return; }
    setLoading(true);
    try {
      await api.post('/routing/keys', {
        name: keyName || '默认Key',
        model,
        key: apiKey,
        baseUrl: baseUrl || undefined,
        plan,
      });
      showMessage(`✅ 已保存（${model} · ${PLAN_OPTIONS.find(p => p.value === plan)?.label}）`);
      setApiKey(''); setBaseUrl('');
      loadKeys();
    } catch (err: any) {
      showMessage(`❌ 保存失败: ${err.message}`);
    }
    setLoading(false);
  };

  const handleRemoveKey = async (name: string) => {
    try {
      await api.delete(`/routing/keys/${name}`);
      showMessage(`已移除 ${name}`);
      loadKeys();
    } catch (err: any) {
      showMessage(`❌ 移除失败: ${err.message}`);
    }
  };

  const handleSaveEmbedding = async () => {
    if (!embeddingApiKey.trim() || !embeddingBaseUrl.trim() || !embeddingModel.trim()) {
      showMessage('Embedding API Key、Base URL 和模型名称都必须填写');
      return;
    }
    setLoading(true);
    try {
      const res: any = await api.post('/routing/embedding-config', {
        apiKey: embeddingApiKey.trim(),
        baseUrl: embeddingBaseUrl.trim(),
        model: embeddingModel.trim(),
      });
      const data = res?.data || res || {};
      if (data.success === false) throw new Error(data.error || '保存失败');
      setEmbeddingApiKey('');
      setEmbeddingConfigured(true);
      const caps: any = await api.get('/routing/capabilities');
      setCapabilities(caps?.data || caps || {});
      showMessage(`✓ 向量服务已验证并保存${data.dimensions ? `（${data.dimensions}维）` : ''}`);
    } catch (err: any) {
      showMessage(`Embedding 配置保存失败：${err.message}`);
    }
    setLoading(false);
  };

  const selectStyle: React.CSSProperties = {
    padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 700, color: '#eaeaea' }}>⚙️ 系统设置</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
        {[
          { id: 'byok', label: '🔑 API Key / Token Plan', desc: '管理密钥和套餐' },
          { id: 'mode', label: '🎯 模式切换', desc: '省钱/常规/高品质' },
          { id: 'prefs', label: '🎨 偏好设置', desc: '主题/编辑器' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: tab === t.id ? 'rgba(233,69,96,0.12)' : 'transparent',
              color: tab === t.id ? '#e94560' : '#8a8aa0', fontSize: '12px', fontWeight: tab === t.id ? 600 : 400,
              textAlign: 'left',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div style={{ padding: '10px 14px', backgroundColor: message.startsWith('✅') ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', borderRadius: '8px', color: message.startsWith('✅') ? '#2ecc71' : '#e74c3c', fontSize: '13px', marginBottom: '16px', border: `1px solid ${message.startsWith('✅') ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'}` }}>
          {message}
        </div>
      )}

      {/* ========= API Key / Token Plan Tab ========= */}
      <div style={{ display: tab === 'byok' ? 'block' : 'none' }}>
        <div>
          <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '7px', background: capabilities.readyForFullSync ? 'rgba(46,204,113,0.10)' : 'rgba(245,158,11,0.10)', border: `1px solid ${capabilities.readyForFullSync ? 'rgba(46,204,113,0.24)' : 'rgba(245,158,11,0.24)'}`, color: capabilities.readyForFullSync ? '#8df0b2' : '#ffd58a', fontSize: '12px', lineHeight: 1.55 }}>
            <strong>{capabilities.readyForFullSync ? 'AI 写作与同步已就绪' : 'AI 同步尚未就绪'}</strong>
            <div>正文/摘要：{capabilities.writing?.available ? '可用' : '未配置'}；向量索引：{capabilities.embedding?.available ? '可用' : `未配置${capabilities.embedding?.reason ? `（${capabilities.embedding.reason}）` : ''}`}</div>
          </div>
          <div style={{ padding: '14px', marginBottom: '16px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}>
            <div style={{ color: '#eaeaea', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>向量索引（Embedding）</div>
            <div style={{ color: embeddingConfigured ? '#8df0b2' : '#ffd58a', fontSize: '12px', marginBottom: '10px' }}>
              {embeddingConfigured ? '已配置并验证真实向量服务' : '未配置。创建项目前必须配置，系统不会用假向量或跳过索引。'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <input value={embeddingApiKey} onChange={e => setEmbeddingApiKey(e.target.value)} type="password" placeholder={embeddingConfigured ? '输入新 Key 可更新配置' : 'Embedding API Key'} style={{ flex: 1, minWidth: '180px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea' }} />
              <input value={embeddingModel} onChange={e => setEmbeddingModel(e.target.value)} placeholder="Embedding 模型名称" style={{ flex: 1, minWidth: '180px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={embeddingBaseUrl} onChange={e => setEmbeddingBaseUrl(e.target.value)} placeholder="Embedding Base URL" style={{ flex: 1, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea' }} />
              <button onClick={handleSaveEmbedding} disabled={loading} style={{ padding: '8px 16px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>{loading ? '正在验证…' : '验证并保存'}</button>
            </div>
          </div>
          <div style={{ marginBottom: '12px', color: '#8a8aa0', fontSize: '12px', lineHeight: 1.6 }}>
            添加 API Key，选择对应的 <strong>Token Plan</strong>（各平台预付费套餐）。系统自动按计划类型分配使用。
          </div>

          {/* Add Form */}
          <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="备注 (如: 我的DeepSeek)"
                style={{ flex: 1, minWidth: '120px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="提供商 (如: DeepSeek)"
                style={{ flex: 1, minWidth: '100px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API Key (sk-...)"
                type="password" style={{ flex: 2, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL (默认自动)"
                style={{ flex: 3, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
            </div>
            {/* Token Plan Selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#8a8aa0', fontSize: '11px' }}>Token Plan：</span>
              <select value={plan} onChange={e => setPlan(e.target.value)} style={selectStyle}>
                {PLAN_OPTIONS.map(p => (
                  <option key={p.value} value={p.value} style={{ backgroundColor: '#1a1a2e', color: '#eaeaea' }}>{p.label}</option>
                ))}
              </select>
            </div>
            <button onClick={handleSaveKey} disabled={loading}
              style={{ padding: '8px 20px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              保存
            </button>
          </div>

          {/* Saved Keys */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea', margin: '0 0 10px 0' }}>已保存的 Key</h3>
            {savedKeys.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c6c80', fontSize: '13px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.06)' }}>还没有保存的 Key</div>
            ) : (
              savedKeys.map((k: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div style={{ color: '#eaeaea', fontSize: '13px', fontWeight: 500 }}>{k.name || k.model}</div>
                    <div style={{ color: '#6c6c80', fontSize: '11px' }}>
                      {k.model} · {k.maskedKey}
                      {k.plan && <span style={{ color: '#a855f7', marginLeft: '6px' }}>· {PLAN_OPTIONS.find(p => p.value === k.plan)?.label || k.plan}</span>}
                      {k.baseUrl && <span style={{ color: '#6c6c80', marginLeft: '6px' }}>· {k.baseUrl}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveKey(k.name)}
                    style={{ padding: '4px 10px', backgroundColor: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '4px', color: '#e74c3c', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>移除</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ========= 模式切换 Tab ========= */}
      <div style={{ display: tab === 'mode' ? 'block' : 'none' }}>
        <div>
          <div style={{ color: '#8a8aa0', fontSize: '12px', marginBottom: '14px', lineHeight: 1.6 }}>
            先为当前模式选择日常模型；未在下表单独指定的 AI 任务都会实际使用它。下表仅用于覆盖指定任务。
          </div>

          {/* Mode Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            {[
              { key: 'economy', label: '💰 省钱模式', color: '#2ecc71', desc: '全用低成本模型' },
              { key: 'normal', label: '⚖️ 常规模式', color: '#3498db', desc: '平衡质量与成本' },
              { key: 'premium', label: '🎲 高品质模式', color: '#e94560', desc: '全用最强模型' },
            ].map(m => (
              <button key={m.key}
                onClick={() => { api.post('/routing/mode', { mode: m.key }).then(() => setWritingMode(m.key)).catch(() => {}); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${writingMode === m.key ? m.color : 'rgba(255,255,255,0.08)'}`,
                  backgroundColor: writingMode === m.key ? `${m.color}15` : 'rgba(255,255,255,0.02)',
                  color: writingMode === m.key ? m.color : '#eaeaea',
                  fontSize: '13px', fontWeight: 600,
                }}>
                <div>{m.label}</div>
                <div style={{ fontSize: '10px', fontWeight: 400, color: writingMode === m.key ? m.color : '#6c6c80', marginTop: '2px' }}>{m.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ marginBottom: '12px', padding: '12px 14px', backgroundColor: 'rgba(52, 211, 153, 0.06)', border: '1px solid rgba(52, 211, 153, 0.28)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#d1fae5', fontSize: '13px', fontWeight: 650 }}>日常模型</div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px', lineHeight: 1.5 }}>未在“指定任务模型”中单独配置的所有 AI 调用，均使用此模型。</div>
            </div>
            <select
              value={sceneMappings.daily?.[writingMode] || ''}
              onChange={e => setSceneMappings(prev => ({ ...prev, daily: { ...(prev.daily || {}), [writingMode]: e.target.value } }))}
              style={{ minWidth: '190px', padding: '7px 9px', borderRadius: '5px', color: '#d1fae5', backgroundColor: '#16213e', border: '1px solid rgba(52, 211, 153, 0.5)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="" style={{ backgroundColor: '#1a1a2e', color: '#eaeaea' }}>请选择日常模型</option>
              {(fetchedModels.length > 0 ? fetchedModels : [
                { id: 'deepseek-chat', name: 'DeepSeek-V3', provider: 'deepseek' },
                { id: 'deepseek-reasoner', name: 'DeepSeek-R1', provider: 'deepseek' },
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
                { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
              ]).map(m => (
                <option key={m.id} value={m.id} style={{ backgroundColor: '#1a1a2e', color: '#eaeaea' }}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Scene Model Table */}
          <div style={{ padding: '14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#eaeaea' }}>指定任务模型</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={fetchModels}
                  style={{
                    padding: '5px 10px', backgroundColor: isFetchingModels ? 'rgba(255,255,255,0.04)' : 'rgba(46,204,113,0.1)',
                    border: `1px solid ${isFetchingModels ? 'rgba(255,255,255,0.08)' : 'rgba(46,204,113,0.2)'}`,
                    borderRadius: '4px', color: isFetchingModels ? '#6c6c80' : '#2ecc71',
                    fontSize: '11px', cursor: isFetchingModels ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }} disabled={isFetchingModels}>
                  {isFetchingModels ? '获取中...' : fetchedModels.length > 0 ? `🔄 刷新模型列表 (${fetchedModels.length})` : '🔄 获取模型列表'}
                </button>
                <button onClick={async () => {
                    try {
                      // 展平嵌套结构为后端需要的 { "场景:mode": "modelId" } 格式
                      const customScenes: Record<string, string> = {};
                      for (const [sk, modes] of Object.entries(sceneMappings)) {
                        for (const mk of ['economy', 'normal', 'premium'] as const) {
                          if (modes[mk]) customScenes[`${sk}:${mk}`] = modes[mk];
                        }
                      }
                      await api.post('/routing/scenario-models', { scenes: customScenes });
                      showMessage('✅ 场景模型配置已保存');
                    } catch { showMessage('❌ 保存失败'); }
                  }}
                  style={{
                    padding: '5px 12px', backgroundColor: '#a855f7', border: 'none', borderRadius: '4px',
                    color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  保存配置
                </button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8a8aa0', fontWeight: 500 }}>场景</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#2ecc71', fontWeight: 500 }}>💰 省钱</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#3498db', fontWeight: 500 }}>⚖️ 常规</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#e94560', fontWeight: 500 }}>🎲 高品质</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'idea_generate', scene: '灵感生成' },
                  { key: 'outline', scene: '大纲概览' },
                  { key: 'writing', scene: '写作' },
                  { key: 'polish', scene: '优化' },
                  { key: 'quality_check', scene: '质检' },
                ].map((row, i) => {
                  const modes = sceneMappings[row.key] || { economy: '', normal: '', premium: '' };
                  const colKeys = ['economy', 'normal', 'premium'] as const;
                  const colColors = ['#2ecc71', '#3498db', '#e94560'];
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '6px 8px', color: '#eaeaea' }}>{row.scene}</td>
                      {colKeys.map((ck, ci) => (
                        <td key={ck} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <select value={modes[ck]}
                            onChange={e => setSceneMappings(prev => ({ ...prev, [row.key]: { ...(prev[row.key] || {}), [ck]: e.target.value } }))}
                            style={{
                              padding: '4px 6px', borderRadius: '4px', fontSize: '11px', maxWidth: '130px',
                              backgroundColor: `${colColors[ci]}12`, border: `1px solid ${colColors[ci]}40`, color: colColors[ci],
                              fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                            }}>
                            <option value="" style={{ backgroundColor: '#1a1a2e', color: '#eaeaea' }}>—</option>
                            {(fetchedModels.length > 0 ? fetchedModels : [
                              { id: 'deepseek-chat', name: 'DeepSeek-V3', provider: 'deepseek' },
                              { id: 'deepseek-reasoner', name: 'DeepSeek-R1', provider: 'deepseek' },
                              { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
                              { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
                              { id: 'glm-4-plus', name: 'GLM-4-Plus', provider: 'zhipu' },
                            ]).map(m => (
                              <option key={m.id} value={m.id} style={{ backgroundColor: '#1a1a2e', color: m.configured === false ? '#6c6c80' : colColors[ci] }}>{m.name}{m.configured === false ? ' (未配置)' : ''}</option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', color: '#8a8aa0', fontSize: '12px', lineHeight: 1.8 }}>
            当前模式：<strong style={{ color: writingMode === 'economy' ? '#2ecc71' : writingMode === 'normal' ? '#3498db' : writingMode === 'premium' ? '#e94560' : '#e94560' }}>
              {writingMode === 'economy' ? '💰 省钱' : writingMode === 'normal' ? '⚖️ 常规' : writingMode === 'premium' ? '🎲 高品质' : `🎲 ${writingMode}`}
            </strong> · 日常模型：<strong style={{ color: '#6ee7b7' }}>{sceneMappings.daily?.[writingMode] || '未设置（沿用原有路由）'}</strong> · 已添加 {savedKeys.length} 个 Key
          </div>
        </div>
      </div>

      {/* ========= 偏好设置 Tab ========= */}
      <div style={{ display: tab === 'prefs' ? 'block' : 'none' }}>
        <div>
          <div style={{ color: '#8a8aa0', fontSize: '12px', marginBottom: '14px' }}>编辑器行为和界面偏好。</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SettingRow label="自动保存间隔">
              <select value={autoSaveInterval} onChange={e => { setAutoSaveInterval(e.target.value); localStorage.setItem('prefs_autoSave', e.target.value); }} style={selectStyle}>
                <option value="10">10秒</option><option value="30">30秒</option><option value="60">1分钟</option><option value="300">5分钟</option>
              </select>
            </SettingRow>
            <SettingRow label="默认字体大小">
              <select value={fontSize} onChange={e => { setFontSize(e.target.value); localStorage.setItem('prefs_fontSize', e.target.value); }} style={selectStyle}>
                <option value="13">13px</option><option value="14">14px</option><option value="15">15px</option><option value="16">16px</option><option value="18">18px</option>
              </select>
            </SettingRow>
            <SettingRow label="默认写作模式">
              <select value={writingStyle} onChange={e => { setWritingStyle(e.target.value); localStorage.setItem('prefs_writingStyle', e.target.value); }} style={selectStyle}>
                <option value="full_auto">全自动</option><option value="semi_auto">半自动</option><option value="manual">手动</option>
              </select>
            </SettingRow>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
    <div style={{ color: '#eaeaea', fontSize: '13px', fontWeight: 500 }}>{label}</div>
    {children}
  </div>
);

export default SettingsPage;
