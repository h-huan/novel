/**
 * WorldSimpleView - 短篇世界观极简视图
 * 设计原则：简洁明了、可视化操作
 * 对接短篇世界观读取与保存接口
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { SectionHeading, FieldList, ChipList } from '../common/ListBlocks';
import { parseJsonToReadable } from '../../lib/textList';

/**
 * 短篇世界观数据结构
 * GET /projects/:id/world-settings?mode=simple
 * PUT /projects/:id/world-settings/simple
 */
interface SimpleWorldSettings {
  storyPremise: string;
  era: 'ancient' | 'modern' | 'future' | '';
  locations: string[];
  socialRules: string;
  specialSettings: string;
  geography: string; socialStructure: string; powerSystem: string;
  economy: string; culture: string; history: string;
  factions: string; endingDirection: string;
  atmosphereTone: string; rules: string; supplementary: string;
  extendedDims: any;
  constraints: any[];
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
  if (typeof value === 'string') return parseJsonToReadable(value);
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined) return '';
  if (typeof parsed === 'string') return parseJsonToReadable(parsed);
  if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed);
  if (Array.isArray(parsed)) return parsed.map(toDisplayText).filter(Boolean).join('\n');
  if (typeof parsed === 'object') {
    return parseJsonToReadable(parsed);
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

const WorldSimpleView: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [settings, setSettings] = useState<SimpleWorldSettings & { extendedDims?: any; constraints?: WorldConstraint[] }>({
    storyPremise: '',
    era: '',
    locations: [],
    socialRules: '',
    specialSettings: '',
    geography: '',
    socialStructure: '',
    powerSystem: '',
    economy: '',
    culture: '',
    history: '',
    factions: '',
    endingDirection: '',
    atmosphereTone: '',
    rules: '',
    supplementary: '',
    extendedDims: null,
    constraints: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showSpecialSettings, setShowSpecialSettings] = useState(false);
  const [locationInput, setLocationInput] = useState('');

  // 加载世界观
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
          // 7维度（per 文档）
          geography: toDisplayText(ws.geography || ''),
          socialStructure: toDisplayText(ws.socialStructure || ''),
          powerSystem: toDisplayText(ws.powerSystem || ''),
          economy: toDisplayText(ws.economy || ''),
          culture: toDisplayText(ws.culture || ''),
          history: toDisplayText(ws.history || ''),
          factions: toDisplayText(ws.factions || ''),
          endingDirection: toDisplayText(ws.endingDirection || ''),
          atmosphereTone: toDisplayText(ws.atmosphereTone || ''),
          rules: toDisplayText(ws.rules || ''),
          supplementary: toDisplayText(ws.supplementary || ''),
          extendedDims: constraints && !Array.isArray(constraints) ? constraints : null,
          constraints: constraintList,
        });
        setShowSpecialSettings(!!toDisplayText(ws.specialSettings || ws.special_settings));
      }
    } catch (error) {
      console.error('加载世界观失败:', error);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadSettings();
    }
  }, [projectId, loadSettings]);

  // 保存世界观
  const saveSettings = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await api.put(`/projects/${projectId}/world-settings/simple`, settings);
      setSaveMessage('✅ 保存成功');
      setIsEditing(false);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('保存世界观失败:', error);
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
    if (!location || settings.locations.includes(location)) return;
    updateSetting('locations', [...settings.locations, location]);
    setLocationInput('');
  };

  // 移除地点
  const removeLocation = (index: number) => {
    updateSetting('locations', settings.locations.filter((_, i) => i !== index));
  };

  const readMode = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 非详细速览层 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeading title="故事速览" accent="var(--color-accent)" hint="一句话背景 · 时代 · 核心地点 · 核心规则" />
        {settings.storyPremise && <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-primary)' }}>{settings.storyPremise}</div>}
        <div><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-info-light)', marginRight: 8 }}>时代</span><ChipList items={settings.era ? [settings.era] : []} color="var(--color-warning)" /></div>
        <div><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-info-light)', marginRight: 8 }}>核心地点</span><ChipList items={settings.locations} color="var(--color-info-light)" /></div>
        <FieldList label="社会与行业规则" value={settings.socialRules} accent="var(--color-purple)" />
        <FieldList label="特殊设定" value={settings.specialSettings} accent="var(--color-warning)" />
      </section>

      {/* 详细设定层 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeading title="详细设定" accent="var(--color-purple)" hint="仅展示已填写维度" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: '时代（时间线/历史背景）', v: settings.history || settings.era, c: 'var(--color-warning)' },
            { label: '地点（主要区域/关键地点）', v: settings.geography, c: 'var(--color-info-light)' },
            { label: '氛围基调', v: settings.atmosphereTone, c: 'var(--color-success)' },
            { label: '规则', v: settings.rules, c: 'var(--color-accent)' },
            { label: '社会结构', v: settings.socialStructure, c: 'var(--color-purple)' },
            { label: '经济体系', v: settings.economy, c: '#38bdf8' },
            { label: '科技/超自然体系', v: settings.powerSystem, c: 'var(--color-pink)' },
            { label: '文化风俗（语言/习俗/禁忌）', v: settings.culture, c: '#34d399' },
            { label: '补充说明', v: settings.supplementary, c: 'var(--color-text-dim)' },
          ].filter(item => item.v).map(item => (
            <div key={item.label} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.14)', backgroundColor: 'rgba(139,92,246,0.05)' }}>
              <FieldList label={item.label} value={item.v} accent={item.c} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          🌍 世界观
        </h2>
        <button
          type="button"
          onClick={() => {
            if (isEditing) { void loadSettings(); setIsEditing(false); }
            else setIsEditing(true);
          }}
          style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(233,69,96,0.45)', background: isEditing ? 'rgba(255,255,255,0.04)' : 'rgba(233,69,96,0.12)', color: isEditing ? 'var(--color-text-soft)' : '#ff9aaa', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
        >
          {isEditing ? '取消编辑' : '编辑'}
        </button>
      </div>

      {saveMessage && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          backgroundColor: saveMessage.includes('✅') ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
          color: saveMessage.includes('✅') ? 'var(--color-success)' : 'var(--color-danger)',
          fontSize: '14px',
        }}>
          {saveMessage}
        </div>
      )}

      {isEditing ? (
      <fieldset style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. 故事背景 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-soft)' }}>
          📖 故事背景
        </label>
        <textarea
          value={settings.storyPremise}
          onChange={(e) => updateSetting('storyPremise', e.target.value)}
          placeholder="故事发生在哪里、什么时期，人物正处在怎样的现实环境中"
          style={{
            padding: '12px',
            fontSize: '15px',
            lineHeight: 1.6,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--color-text-primary)',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            minHeight: '80px',
          }}
        />
      </section>

      {/* 2. 时代背景选择器 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-soft)' }}>
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
                    ? 'var(--color-accent)' 
                    : 'rgba(255,255,255,0.1)'
                }`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--color-text-primary)',
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
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-soft)' }}>
          📍 核心地点
          <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
            {settings.locations.length} 个
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
                fontSize: '14px',
                color: 'var(--color-accent)',
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
                  color: 'var(--color-accent)',
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
                color: 'var(--color-text-primary)',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              onClick={addLocation}
              disabled={!locationInput.trim()}
              style={{
                padding: '8px 14px',
                backgroundColor: locationInput.trim() ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: '6px',
                color: locationInput.trim() ? 'var(--color-white)' : 'var(--color-text-muted)',
                fontSize: '14px',
                cursor: locationInput.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              添加
            </button>
        </div>
      </section>

      {/* 4. 社会规则文本域 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-soft)' }}>
          ⚖️ 社会与行业规则
        </label>
        <textarea
          value={settings.socialRules}
          onChange={(e) => updateSetting('socialRules', e.target.value)}
          placeholder="只写与剧情有关的行业规则、法律边界、社会关系或生活常识"
          style={{
            padding: '12px',
            fontSize: '14px',
            lineHeight: 1.6,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'var(--color-text-primary)',
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
            color: 'var(--color-text-dim)',
            fontSize: '14px',
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
              fontSize: '14px',
              lineHeight: 1.6,
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              minHeight: '60px',
            }}
          />
        )}
      </section>

      {/* 6. 详细设定 已在阅读模式 readMode 展示（列表化），编辑区不再重复展示 */}

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
            color: 'var(--color-text-dim)',
            fontSize: '14px',
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
            backgroundColor: saving ? 'rgba(233,69,96,0.5)' : 'var(--color-accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--color-white)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? '保存中...' : '💾 保存设定'}
        </button>
      </div>

      </fieldset>
      ) : (
        readMode
      )}
    </div>
  );
};

export default WorldSimpleView;
