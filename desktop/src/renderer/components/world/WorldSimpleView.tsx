/**
 * WorldSimpleView - 短篇世界观极简视图
 * 设计原则：简洁明了、可视化操作
 * 对接 API：待后端提供短篇世界观接口
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';

/**
 * 短篇世界观数据结构
 * TODO: 后端需要提供对应的 API 接口
 * GET/PUT /projects/:id/world-simple
 */
interface SimpleWorldSettings {
  storyPremise: string;        // 故事前提
  era: 'ancient' | 'modern' | 'future' | '';  // 时代背景
  locations: string[];         // 核心地点（最多3个）
  socialRules: string;         // 社会规则（200字限制）
  specialSettings: string;     // 特殊设定（可选）
}

interface WorldConstraint {
  id?: string;
  category?: string;
  rule?: string;
  description?: string;
  severity?: string;
}

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return '';
  if (!text.startsWith('{') && !text.startsWith('[')) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const toDisplayText = (value: unknown): string => {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined) return '';
  if (typeof parsed === 'string') return parsed;
  if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed);
  if (Array.isArray(parsed)) return parsed.map(toDisplayText).filter(Boolean).join('、');
  if (typeof parsed === 'object') {
    const item = parsed as Record<string, unknown>;
    const name = toDisplayText(item.name || item.title);
    const type = toDisplayText(item.type || item.level || item.category);
    const description = toDisplayText(item.description || item.rule || item.content);
    if (name && description) return type ? `${name}（${type}）：${description}` : `${name}：${description}`;
    return name || description || JSON.stringify(item);
  }
  return '';
};

const toTextArray = (value: unknown): string[] => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.map(toDisplayText).filter(Boolean);
  const text = toDisplayText(parsed);
  return text ? [text] : [];
};

const normalizeEra = (value: unknown): SimpleWorldSettings['era'] => {
  const text = toDisplayText(value).toLowerCase();
  if (!text) return '';
  if (text.includes('ancient') || text.includes('古') || text.includes('王朝') || text.includes('修真')) return 'ancient';
  if (text.includes('future') || text.includes('未来') || text.includes('科幻') || text.includes('星际') || text.includes('末世')) return 'future';
  if (text.includes('modern') || text.includes('现代') || text.includes('当代') || text.includes('民国') || text.includes('北洋') || text.includes('都市')) return 'modern';
  return '';
};

const ERA_OPTIONS = [
  { value: 'ancient', label: '古代', icon: '🏯' },
  { value: 'modern', label: '现代', icon: '🏙️' },
  { value: 'future', label: '未来', icon: '🚀' },
] as const;

const SOCIAL_RULES_TEMPLATES = [
  { label: '封建等级', template: '社会等级森严，贵族享有特权，平民上升通道狭窄。' },
  { label: '科技垄断', template: '高科技被少数企业或组织垄断，普通人难以获得。' },
  { label: '魔法体系', template: '魔法力量需要天赋或特殊条件才能使用，并非人人可及。' },
  { label: '末世秩序', template: '文明崩溃后，幸存者建立新的秩序与规则。' },
];

const WorldSimpleView: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [settings, setSettings] = useState<SimpleWorldSettings & { extendedDims?: any; constraints?: WorldConstraint[] }>({
    storyPremise: '',
    era: '',
    locations: [],
    socialRules: '',
    specialSettings: '',
    extendedDims: null,
    constraints: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showSpecialSettings, setShowSpecialSettings] = useState(false);
  const [locationInput, setLocationInput] = useState('');

  // 加载世界观设定
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}/world-settings?mode=simple`);
      const data = (res as any).data ?? res;
      const ws = Array.isArray(data) ? data[0] : data;
      if (ws) {
        let constraints: any = null;
        try { constraints = typeof ws.constraints === 'string' ? JSON.parse(ws.constraints) : ws.constraints; } catch {}
        const constraintList = Array.isArray(constraints) ? constraints : [];
        setSettings({
          storyPremise: toDisplayText(ws.storyPremise || ws.story_premise || ''),
          era: normalizeEra(ws.era || ws.eraBackground || ws.era_background),
          locations: toTextArray(ws.locations).length > 0 ? toTextArray(ws.locations) : toTextArray(ws.geography),
          socialRules: toDisplayText(ws.socialRules || ws.social_rules || ws.rules || ''),
          specialSettings: toDisplayText(ws.specialSettings || ws.special_settings || ''),
          extendedDims: constraints && !Array.isArray(constraints) ? constraints : null,
          constraints: constraintList,
        });
        setShowSpecialSettings(!!toDisplayText(ws.specialSettings || ws.special_settings));
      }
    } catch (error) {
      console.error('加载世界观设定失败:', error);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadSettings();
    }
  }, [projectId, loadSettings]);

  // 保存世界观设定
  const saveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      // TODO: 后端需要提供 PUT /projects/:id/world-settings/simple 接口
      await api.put(`/projects/${projectId}/world-settings/simple`, settings);
      setSaveMessage('✅ 保存成功');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('保存世界观设定失败:', error);
      setSaveMessage('❌ 保存失败，请重试');
    }
    setSaving(false);
  };

  // 更新设定字段
  const updateSetting = <K extends keyof SimpleWorldSettings>(
    key: K,
    value: SimpleWorldSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // 添加地点
  const addLocation = () => {
    const location = locationInput.trim();
    if (!location || settings.locations.length >= 3) return;
    updateSetting('locations', [...settings.locations, location]);
    setLocationInput('');
  };

  // 移除地点
  const removeLocation = (index: number) => {
    updateSetting('locations', settings.locations.filter((_, i) => i !== index));
  };

  // 应用社会规则模板
  const applyTemplate = (template: string) => {
    updateSetting('socialRules', template);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>
          🌍 世界观设定
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#8a8aa0' }}>
          短篇小说的世界观应当简洁明了，专注于核心设定
        </p>
      </div>

      {saveMessage && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          backgroundColor: saveMessage.includes('✅') ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
          color: saveMessage.includes('✅') ? '#2ecc71' : '#e74c3c',
          fontSize: '13px',
        }}>
          {saveMessage}
        </div>
      )}

      {/* 1. 故事前提输入 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0' }}>
          📖 故事前提
        </label>
        <textarea
          value={settings.storyPremise}
          onChange={(e) => updateSetting('storyPremise', e.target.value)}
          placeholder='例如："一个关于勇气与成长的故事"'
          style={{
            padding: '12px',
            fontSize: '15px',
            lineHeight: 1.6,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#eaeaea',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            minHeight: '80px',
          }}
        />
      </section>

      {/* 2. 时代背景选择器 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0' }}>
          🕐 时代背景
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          {ERA_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => updateSetting('era', option.value)}
              style={{
                flex: 1,
                padding: '16px 12px',
                backgroundColor: settings.era === option.value 
                  ? 'rgba(233,69,96,0.15)' 
                  : 'rgba(255,255,255,0.03)',
                border: `2px solid ${
                  settings.era === option.value 
                    ? '#e94560' 
                    : 'rgba(255,255,255,0.1)'
                }`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#eaeaea',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{option.icon}</div>
              <div>{option.label}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. 核心地点标签 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0' }}>
          📍 核心地点
          <span style={{ fontSize: '11px', color: '#6c6c80', marginLeft: '8px' }}>
            {settings.locations.length}/3
          </span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {settings.locations.map((location, index) => (
            <span
              key={index}
              style={{
                padding: '6px 10px',
                backgroundColor: 'rgba(233,69,96,0.1)',
                border: '1px solid rgba(233,69,96,0.3)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#e94560',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {location}
              <button
                onClick={() => removeLocation(index)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#e94560',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 2px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {settings.locations.length < 3 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addLocation()}
              placeholder="输入地点名称，按回车添加"
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: '#eaeaea',
                fontSize: '12px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              onClick={addLocation}
              disabled={!locationInput.trim()}
              style={{
                padding: '8px 14px',
                backgroundColor: locationInput.trim() ? '#e94560' : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: '6px',
                color: locationInput.trim() ? '#fff' : '#6c6c80',
                fontSize: '12px',
                cursor: locationInput.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              添加
            </button>
          </div>
        )}
      </section>

      {/* 4. 社会规则文本域 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0' }}>
          ⚖️ 社会规则
          <span style={{ fontSize: '11px', color: '#6c6c80', marginLeft: '8px' }}>
            {settings.socialRules.length}/200
          </span>
        </label>
        {/* 快捷模板 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {SOCIAL_RULES_TEMPLATES.map((tmpl, index) => (
            <button
              key={index}
              onClick={() => applyTemplate(tmpl.template)}
              style={{
                padding: '4px 10px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                color: '#8a8aa0',
                fontSize: '11px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tmpl.label}
            </button>
          ))}
        </div>
        <textarea
          value={settings.socialRules}
          onChange={(e) => {
            if (e.target.value.length <= 200) {
              updateSetting('socialRules', e.target.value);
            }
          }}
          placeholder="描述故事世界的社会规则、法律体系、文化习俗等..."
          style={{
            padding: '12px',
            fontSize: '13px',
            lineHeight: 1.6,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#eaeaea',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            minHeight: '80px',
          }}
        />
      </section>

      {/* 5. 特殊设定折叠区 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={() => setShowSpecialSettings(!showSpecialSettings)}
          style={{
            padding: '8px 12px',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: '#8a8aa0',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>🔮 特殊设定（可选）</span>
          <span>{showSpecialSettings ? '▲' : '▼'}</span>
        </button>
        {showSpecialSettings && (
          <textarea
            value={settings.specialSettings}
            onChange={(e) => updateSetting('specialSettings', e.target.value)}
            placeholder="描述魔法体系、科技水平、特殊能力等特殊设定..."
            style={{
              padding: '12px',
              fontSize: '13px',
              lineHeight: 1.6,
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#eaeaea',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              minHeight: '60px',
            }}
          />
        )}
      </section>

      {settings.constraints && settings.constraints.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0' }}>
            世界观约束
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {settings.constraints.map((item, index) => (
              <div
                key={item.id || `${item.category || 'constraint'}-${index}`}
                style={{
                  padding: '12px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#8a8aa0' }}>{toDisplayText(item.category) || '约束'}</span>
                  <span style={{ fontSize: '11px', color: item.severity === 'hard' ? '#e94560' : '#f6c85f' }}>
                    {toDisplayText(item.severity) || 'normal'}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#eaeaea', fontWeight: 600, marginBottom: '4px' }}>
                  {toDisplayText(item.rule) || '未命名规则'}
                </div>
                {toDisplayText(item.description) && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#8a8aa0', lineHeight: 1.55 }}>
                    {toDisplayText(item.description)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 保存按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px' }}>
        <button
          onClick={loadSettings}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color: '#8a8aa0',
            fontSize: '13px',
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          🔄 重新加载
        </button>
        <button
          onClick={saveSettings}
          disabled={saving}
          style={{
            padding: '10px 24px',
            backgroundColor: saving ? 'rgba(233,69,96,0.5)' : '#e94560',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? '保存中...' : '💾 保存设定'}
        </button>
      </div>

      {/* 长篇7维度扩展展示 */}
      {settings.extendedDims && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '4px' }}>📐 长篇世界观扩展</div>
          {[
            { k: 'socialStructure', l: '🏛️ 社会结构' },
            { k: 'powerSystem', l: '⚡ 力量体系' },
            { k: 'economy', l: '💰 经济体系' },
            { k: 'culture', l: '🎭 文化特色' },
            { k: 'history', l: '📜 历史背景' },
          ].map(d => settings.extendedDims[d.k] ? (
            <div key={d.k}>
              <span style={{ fontSize: '11px', color: '#6c6c80', fontWeight: 600 }}>{d.l}</span>
              <p style={{ fontSize: '12px', color: '#8a8aa0', margin: '2px 0 0 0', lineHeight: 1.5 }}>{toDisplayText(settings.extendedDims[d.k])}</p>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
};

export default WorldSimpleView;
