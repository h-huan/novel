/**
 * DictionaryModal - 字典管理弹框
 * 将原 DictionaryPage 的内容包装为 Modal 形式
 * 通过顶部 Header 按钮触发打开，不占用路由导航
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';

interface DictionaryModalProps {
  open: boolean;
  onClose: () => void;
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1500,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modal: {
    width: '820px', maxWidth: '92vw', height: '70vh', maxHeight: '700px',
    backgroundColor: '#1a1a2e', borderRadius: '14px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
  },
  title: { fontSize: '16px', fontWeight: 700, color: '#eaeaea', margin: 0 },
  subtitle: { fontSize: '12px', color: '#8a8aa0', margin: '4px 0 0' },
};

/** 复用 DictionaryPage 核心逻辑的内部组件 */
const DictionaryContent: React.FC = () => {
  const [dictTypes, setDictTypes] = useState<string[]>([]);
  const [activeType, setActiveType] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [subItems, setSubItems] = useState<any[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const isCategory = activeType === 'story_category';

  const loadTypes = useCallback(() => {
    api.get('/dict/types/all').then(r => {
      const types = (r as any)?.types || [];
      setDictTypes(types);
      if (types.length > 0 && !activeType) setActiveType(types[0]);
    }).catch(() => {});
  }, [activeType]);

  const loadItems = useCallback(() => {
    if (!activeType) return;
    api.get('/dict/' + activeType).then(r => setItems((r as any)?.items || [])).catch(() => {});
    if (isCategory) {
      api.get('/dict/story_subcategory').then(r => setSubItems((r as any)?.items || [])).catch(() => {});
    }
  }, [activeType]);

  useEffect(() => { loadTypes(); }, []);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    await api.post('/dict', { dictType: activeType, label: newLabel.trim() });
    setNewLabel('');
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await api.delete('/dict/' + id);
    loadItems();
  };

  const handleSaveEdit = async (id: string) => {
    if (!editLabel.trim()) return;
    await api.put('/dict/' + id, { label: editLabel.trim() });
    setEditingId(null);
    loadItems();
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    await api.post('/dict', { dictType: newTypeName.trim(), label: '(占位，请修改)' });
    setNewTypeName('');
    loadTypes();
  };

  const handleSeed = async () => {
    const res = await api.post('/dict/seed');
    const count = (res as any)?.count || 0;
    if (count > 0) { loadTypes(); setActiveType(''); }
  };

  // 内联样式
  const btnStyle = (bg: string, border: string, color: string): React.CSSProperties => ({
    padding: '6px 14px', backgroundColor: bg, border: `1px solid ${border}`,
    borderRadius: '6px', color, fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
    color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
  };

  const typeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '12px', fontWeight: active ? 600 : 400,
    backgroundColor: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
    color: active ? '#d8b4fe' : '#8a8aa0',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ ...s.title, fontSize: '18px' }}>📖 字典管理</h2>
          <p style={s.subtitle}>管理平台级的字典数据，所有项目共享</p>
        </div>
        <button onClick={handleSeed} style={btnStyle('rgba(46,204,113,0.1)', 'rgba(46,204,113,0.2)', '#2ecc71')}>
          🔄 恢复默认
        </button>
      </div>

      {/* 类型选择器 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px', alignItems: 'center' }}>
        {dictTypes.map(t => (
          <button key={t} onClick={() => setActiveType(t)} style={typeBtnStyle(activeType === t)}>
            {t === 'story_category' ? '📚 故事分类' : t === 'writing_style' ? '✍️ 写作风格' : t === 'tone_tag' ? '🎭 故事基调' : `🏷️ ${t}`}
          </button>
        ))}
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          <input
            value={newTypeName}
            onChange={e => setNewTypeName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateType()}
            placeholder="新建字典类型"
            style={{ ...inputStyle, width: '110px', fontSize: '11px' }}
          />
          <button onClick={handleCreateType} style={{ padding: '5px 8px', backgroundColor: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '4px', color: '#d8b4fe', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
            +新建
          </button>
        </div>
      </div>

      {/* 添加表单 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={`添加${activeType === 'story_category' ? '故事大类' : activeType === 'writing_style' ? '写作风格' : '字典项'}`}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={handleAdd} style={btnStyle('#a855f7', 'transparent', '#fff')}>
          添加
        </button>
      </div>

      {/* 列表内容 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1 }}>
        {items.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: '#6c6c80', fontSize: '13px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.06)' }}>
            暂无数据，添加第一条
          </div>
        )}
        {items.map((item: any) => (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {editingId === item.id ? (
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEdit(item.id)}
                    autoFocus
                    style={{ padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '4px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none', flex: 1 }}
                  />
                ) : (
                  <span style={{ color: '#eaeaea', fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
                )}
                {isCategory && (
                  <span style={{ fontSize: '10px', color: '#6c6c80' }}>({subItems.filter((s: any) => s.parentLabel === item.label).length} 子项)</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {editingId === item.id ? (
                  <>
                    <button onClick={() => handleSaveEdit(item.id)} style={{ padding: '3px 8px', backgroundColor: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: '4px', color: '#2ecc71', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>保存</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '3px 8px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#8a8aa0', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditingId(item.id); setEditLabel(item.label); }} style={{ padding: '3px 8px', backgroundColor: 'rgba(52,152,219,0.1)', border: '1px solid rgba(52,152,219,0.2)', borderRadius: '4px', color: '#3498db', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>编辑</button>
                    <button onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', backgroundColor: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '4px', color: '#e74c3c', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>删除</button>
                  </>
                )}
              </div>
            </div>
            {isCategory && (
              <div style={{ marginLeft: '24px', marginTop: '4px', marginBottom: '4px' }}>
                {subItems.filter((s: any) => s.parentLabel === item.label).map((sub: any) => (
                  <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderRadius: '4px', marginBottom: '2px' }}>
                    <span style={{ color: '#8a8aa0', fontSize: '12px' }}>└ {sub.label}</span>
                    <button onClick={() => handleDelete(sub.id)} style={{ padding: '2px 6px', backgroundColor: 'rgba(231,76,60,0.05)', border: '1px solid rgba(231,76,60,0.1)', borderRadius: '3px', color: '#e74c3c', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}>删除</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <input
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                        const val = (e.target as HTMLInputElement).value.trim();
                        await api.post('/dict', { dictType: 'story_subcategory', label: val, parentLabel: item.label });
                        (e.target as HTMLInputElement).value = '';
                        loadItems();
                      }
                    }}
                    placeholder={`+ 子项到 "${item.label}"`}
                    style={{ flex: 1, padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const DictionaryModal: React.FC<DictionaryModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  // ESC 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* 弹框头部 */}
        <div style={s.header}>
          <div>
            <h3 style={s.title}>📖 字典管理</h3>
            <p style={s.subtitle}>平台级共享字典数据</p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px', borderRadius: '6px', background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#8a8aa0', cursor: 'pointer', fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div style={s.body}>
          <DictionaryContent />
        </div>
      </div>
    </div>
  );
};

export default DictionaryModal;
