/**
 * SettingsPage - 系统设置
 * API Key 管理 + 精确模型场景配置
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState('byok');
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [model, setModel] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [writingMode, setWritingMode] = useState('normal');
  const [editingMode, setEditingMode] = useState('normal');
  const [savedKeys, setSavedKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sceneMappings, setSceneMappings] = useState<Record<string, Record<string, string>>>({});
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string; provider: string; configured?: boolean }>>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
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
      if (mode) {
        setWritingMode(mode);
        setEditingMode(mode);
      }
    }).catch(() => {});
    // 自动获取模型列表
    fetchModels();
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

  const flattenSceneMappings = (): Record<string, string> => {
    const scenes: Record<string, string> = {};
    for (const [scene, modes] of Object.entries(sceneMappings)) {
      for (const mode of ['economy', 'normal', 'premium'] as const) {
        if (modes[mode]) scenes[`${scene}:${mode}`] = modes[mode];
      }
    }
    return scenes;
  };

  const saveSceneMappings = async (): Promise<void> => {
    await api.post('/routing/scenario-models', { scenes: flattenSceneMappings() });
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
      });
      showMessage(`✅ ${model} API Key 已保存`);
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

  const selectStyle: React.CSSProperties = {
    padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>⚙️ 系统设置</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
        {[
          { id: 'byok', label: '🔑 API Key', desc: '管理模型密钥' },
          { id: 'mode', label: '🎯 模型配置', desc: '按场景指定模型' },
          { id: 'prefs', label: '🎨 偏好设置', desc: '主题/编辑器' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: tab === t.id ? 'rgba(233,69,96,0.12)' : 'transparent',
              color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', fontWeight: tab === t.id ? 600 : 400,
              textAlign: 'left',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div style={{ padding: '10px 14px', backgroundColor: message.startsWith('✅') ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', borderRadius: '8px', color: message.startsWith('✅') ? 'var(--color-success)' : 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginBottom: '16px', border: `1px solid ${message.startsWith('✅') ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'}` }}>
          {message}
        </div>
      )}

      {/* ========= API Key Tab ========= */}
      <div style={{ display: tab === 'byok' ? 'block' : 'none' }}>
        <div>
          <div style={{ marginBottom: '12px', color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
            API Key 只用于你在模型配置中明确选择的模型。系统不会自动替换模型或提供商。
          </div>

          {/* Add Form */}
          <form onSubmit={(event) => { event.preventDefault(); void handleSaveKey(); }} style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="备注 (如: 我的DeepSeek)"
                style={{ flex: 1, minWidth: '120px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }} />
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="提供商 (如: DeepSeek)" autoComplete="username"
                style={{ flex: 1, minWidth: '100px', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API Key (sk-...)"
                type="password" autoComplete="new-password" style={{ flex: 2, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }} />
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL (默认自动)"
                style={{ flex: 3, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <button type="submit" disabled={loading}
              style={{ padding: '8px 20px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '6px', color: 'var(--color-white)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              保存
            </button>
          </form>

          {/* Saved Keys */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 10px 0' }}>已保存的 Key</h3>
            {savedKeys.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.06)' }}>还没有保存的 Key</div>
            ) : (
              savedKeys.map((k: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>{k.name || k.model}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      {k.model} · {k.maskedKey}
                      {k.baseUrl && <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>· {k.baseUrl}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveKey(k.name)}
                    style={{ padding: '4px 10px', backgroundColor: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '4px', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontFamily: 'inherit' }}>移除</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ========= 模型配置 Tab ========= */}
      <div style={{ display: tab === 'mode' ? 'block' : 'none' }}>
        <div>
          <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', marginBottom: '14px', lineHeight: 1.6 }}>
            先选择要配置的模式。日常模型是该模式的必填项；指定任务未单独配置时使用该模式的日常模型。保存配置后，再明确启用该模式。
          </div>

          {/* Mode Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            {[
              { key: 'economy', label: '💰 省钱模式', color: 'var(--color-success)', desc: '使用本列配置' },
              { key: 'normal', label: '⚖️ 常规模式', color: 'var(--color-info)', desc: '使用本列配置' },
              { key: 'premium', label: '🎲 高品质模式', color: 'var(--color-accent)', desc: '使用本列配置' },
            ].map(m => (
              <button key={m.key}
                onClick={() => setEditingMode(m.key)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                  border: `2px solid ${editingMode === m.key ? m.color : 'rgba(255,255,255,0.08)'}`,
                  backgroundColor: editingMode === m.key ? `${m.color}15` : 'rgba(255,255,255,0.02)',
                  color: editingMode === m.key ? m.color : 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-xs)', fontWeight: 600,
                }}>
                <div>{m.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, color: editingMode === m.key ? m.color : 'var(--color-text-muted)', marginTop: '2px' }}>
                  {writingMode === m.key ? '当前已启用' : m.desc}
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginBottom: '12px', padding: '12px 14px', backgroundColor: 'rgba(52, 211, 153, 0.06)', border: '1px solid rgba(52, 211, 153, 0.28)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#d1fae5', fontSize: 'var(--font-size-xs)', fontWeight: 650 }}>日常模型</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '3px', lineHeight: 1.5 }}>未在“指定任务模型”中单独配置的所有 AI 调用，均使用此模型。</div>
            </div>
            <select
              value={sceneMappings.daily?.[editingMode] || ''}
              onChange={e => setSceneMappings(prev => ({ ...prev, daily: { ...(prev.daily || {}), [editingMode]: e.target.value } }))}
              style={{ minWidth: '190px', padding: '7px 9px', borderRadius: '5px', color: '#d1fae5', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid rgba(52, 211, 153, 0.5)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="" style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>请选择日常模型</option>
              {fetchedModels.length === 0 && (
                <option value="" disabled style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-muted)' }}>未获取到模型，请点“获取模型列表”或在密钥管理中添加</option>
              )}
              {fetchedModels.map(m => (
                <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Scene Model Table */}
          <div style={{ padding: '14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>指定任务模型</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={fetchModels}
                  style={{
                    padding: '5px 10px', backgroundColor: isFetchingModels ? 'rgba(255,255,255,0.04)' : 'rgba(46,204,113,0.1)',
                    border: `1px solid ${isFetchingModels ? 'rgba(255,255,255,0.08)' : 'rgba(46,204,113,0.2)'}`,
                    borderRadius: '4px', color: isFetchingModels ? 'var(--color-text-muted)' : 'var(--color-success)',
                    fontSize: 'var(--font-size-xs)', cursor: isFetchingModels ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }} disabled={isFetchingModels}>
                  {isFetchingModels ? '获取中...' : fetchedModels.length > 0 ? `🔄 刷新模型列表 (${fetchedModels.length})` : '🔄 获取模型列表'}
                </button>
                <button onClick={async () => {
                    try {
                      await saveSceneMappings();
                      showMessage('✅ 场景模型配置已保存');
                    } catch { showMessage('❌ 保存失败'); }
                  }}
                  style={{
                    padding: '5px 12px', backgroundColor: 'var(--color-purple)', border: 'none', borderRadius: '4px',
                    color: 'var(--color-white)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  保存配置
                </button>
                <button onClick={async () => {
                    const dailyModel = sceneMappings.daily?.[editingMode];
                    if (!dailyModel) {
                      showMessage('❌ 请先选择并保存该模式的日常模型');
                      return;
                    }
                    try {
                      await saveSceneMappings();
                      await api.post('/routing/mode', { mode: editingMode });
                      setWritingMode(editingMode);
                      showMessage(`✅ 已启用${editingMode === 'economy' ? '省钱' : editingMode === 'normal' ? '常规' : '高品质'}模式`);
                    } catch {
                      showMessage('❌ 模式启用失败，请检查服务连接');
                    }
                  }}
                  style={{
                    padding: '5px 12px', backgroundColor: 'var(--color-info)', border: 'none', borderRadius: '4px',
                    color: 'var(--color-white)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  启用此模式
                </button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-dim)', fontWeight: 500 }}>场景</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--color-success)', fontWeight: 500 }}>💰 省钱</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--color-info)', fontWeight: 500 }}>⚖️ 常规</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--color-accent)', fontWeight: 500 }}>🎲 高品质</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'idea_generate', scene: '灵感发现' },
                  { key: 'outline', scene: '大纲/架构（角色·组织·伏笔·时间线）' },
                  { key: 'writing', scene: '正文写作（日常/高潮）' },
                  { key: 'polish', scene: '优化精修/质检' },
                ].map((row, i) => {
                  const modes = sceneMappings[row.key] || { economy: '', normal: '', premium: '' };
                  const colKeys = ['economy', 'normal', 'premium'] as const;
                  const colColors = ['var(--color-success)', 'var(--color-info)', 'var(--color-accent)'];
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--color-text-primary)' }}>{row.scene}</td>
                      {colKeys.map((ck, ci) => (
                        <td key={ck} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <select value={modes[ck]}
                            onChange={e => setSceneMappings(prev => ({ ...prev, [row.key]: { ...(prev[row.key] || {}), [ck]: e.target.value } }))}
                            style={{
                              padding: '4px 6px', borderRadius: '4px', fontSize: 'var(--font-size-xs)', maxWidth: '130px',
                              backgroundColor: `${colColors[ci]}12`, border: `1px solid ${colColors[ci]}40`, color: colColors[ci],
                              fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                            }}>
                            <option value="" style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>—</option>
                            {fetchedModels.length === 0 && (
                              <option value="" disabled>未获取到模型，请点上方“获取模型列表”</option>
                            )}
                            {fetchedModels.map(m => (
                              <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--color-bg-primary)', color: m.configured === false ? 'var(--color-text-muted)' : colColors[ci] }}>{m.name}{m.configured === false ? ' (未配置)' : ''}</option>
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

          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', lineHeight: 1.8 }}>
            当前模式：<strong style={{ color: writingMode === 'economy' ? 'var(--color-success)' : writingMode === 'normal' ? 'var(--color-info)' : writingMode === 'premium' ? 'var(--color-accent)' : 'var(--color-accent)' }}>
              {writingMode === 'economy' ? '💰 省钱' : writingMode === 'normal' ? '⚖️ 常规' : writingMode === 'premium' ? '🎲 高品质' : `🎲 ${writingMode}`}
            </strong> · 日常模型：<strong style={{ color: '#6ee7b7' }}>{sceneMappings.daily?.[writingMode] || '未配置'}</strong> · 正在配置：<strong>{editingMode === 'economy' ? '省钱' : editingMode === 'normal' ? '常规' : '高品质'}</strong> · 已添加 {savedKeys.length} 个 Key
          </div>
        </div>
      </div>

      {/* ========= 偏好设置 Tab ========= */}
      <div style={{ display: tab === 'prefs' ? 'block' : 'none' }}>
        <div>
          <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', marginBottom: '14px' }}>编辑器行为和界面偏好。</div>
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
    <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>{label}</div>
    {children}
  </div>
);

export default SettingsPage;
