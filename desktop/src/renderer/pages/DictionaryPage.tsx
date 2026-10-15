/** The dictionary owns author choices; discovery reads its saved entries. */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DISCOVERY_TAG_GROUPS, STYLE_GUIDES } from '@novel/shared';
import { api } from '../lib/api';
import { CREATIVE_DICTIONARY_TYPES, dictionaryDiscoveryTags, dictionaryRowsForTag, type CreativeDictionaryItem } from '../lib/discoveryTagOptions';
import './DictionaryPage.css';

const fields = [
  ...DISCOVERY_TAG_GROUPS.filter(group => group.key !== '平台标签（待核实分组）').map(group => ({ key: group.key as string, label: group.label, description: group.description })),
  { key: 'writing_style', label: '文风', description: '控制文字表达与叙述方式。' },
  { key: 'narrative_pov', label: '叙事视角', description: '决定人称与信息范围。' },
];
interface DictionaryEntry { key: string; label: string; hint: string; rows: CreativeDictionaryItem[]; }

const DictionaryPage: React.FC = () => {
  const listRef = useRef<HTMLDivElement>(null);
  const [allItems, setAllItems] = useState<CreativeDictionaryItem[]>([]);
  const [activeField, setActiveField] = useState(fields[0].key);
  const [seedVersion, setSeedVersion] = useState<number>();
  const [newLabel, setNewLabel] = useState('');
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string>();
  const [editLabel, setEditLabel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [activeField, search]);

  const loadItems = useCallback(async () => {
    const [meta, ...results] = await Promise.all([
      api.get<any>('/dict/types/all'),
      ...CREATIVE_DICTIONARY_TYPES.map(type => api.get<any>('/dict/' + type)),
    ]);
    setAllItems(results.flatMap(result => (result as any).items || []));
    setSeedVersion((meta as any).seedVersion);
  }, []);
  useEffect(() => { loadItems().catch(error => setMessage(error.message || '读取字典失败')); }, [loadItems]);

  const tagOptions = dictionaryDiscoveryTags(allItems);
  const directField = activeField === 'writing_style' || activeField === 'narrative_pov';
  const entries: DictionaryEntry[] = directField
    ? allItems.filter(item => item.dictType === activeField).map(item => ({ key: item.id, label: item.label, hint: activeField === 'writing_style' ? STYLE_GUIDES[item.label] || '' : '', rows: [item] }))
    : tagOptions.filter(option => option.group === activeField).map(option => ({ key: option.value, label: option.label, hint: option.hint, rows: dictionaryRowsForTag(option, allItems) }));
  const visible = entries.filter(entry => (entry.label + ' ' + entry.hint + ' ' + entry.rows.map(row => row.label).join(' ')).includes(search.trim()));
  const currentField = fields.find(field => field.key === activeField)!;
  const notify = () => window.dispatchEvent(new Event('story-dictionary-changed'));
  const mutate = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await action(); await loadItems(); notify(); }
    catch (error: any) { setMessage(error.message || '字典更新失败'); }
    finally { setBusy(false); }
  };
  const check = (result: any) => { if (!result.success) throw new Error(result.error || '字典更新失败'); };
  const add = () => mutate(async () => {
    if (!newLabel.trim()) return;
    if (tagOptions.some(option => option.value === newLabel.trim() || option.bindings.some(binding => binding.value === newLabel.trim())) || entries.some(entry => entry.label === newLabel.trim())) throw new Error('该词条已存在，请在现有分组中管理。');
    check(await api.post('/dict', { dictType: directField ? activeField : 'plot_tag', label: newLabel.trim(), ...(directField ? {} : { parentLabel: activeField }) }));
    setNewLabel('');
  });
  const save = (entry: DictionaryEntry) => mutate(async () => {
    const value = editLabel.trim();
    if (!value) return;
    if (allItems.some(item => item.label === value && entry.rows.some(row => row.dictType === item.dictType) && !entry.rows.some(row => row.id === item.id))) throw new Error('该名称已存在，请使用其他名称。');
    if (new Set(entry.rows.map(row => row.dictType)).size !== entry.rows.length) throw new Error('该选项含同类同义词，请使用不同名称，避免覆盖。');
    for (const row of entry.rows) check(await api.put('/dict/' + row.id, { label: value, ...(directField ? {} : { parentLabel: activeField }) }));
    setEditingKey(undefined);
  });
  const remove = (entry: DictionaryEntry) => mutate(async () => {
    for (const row of entry.rows) check(await api.delete('/dict/' + row.id));
  });

  return <div className="dictionary-page">
    <header className="dictionary-page__toolbar">
      <div className="dictionary-page__heading">
        <div>
          <h1>创作字典 <span>v{seedVersion || '…'}</span></h1>
          <p>在这里补充和管理词条，灵感发现读取已保存的选项。</p>
        </div>
        <button className="dictionary-page__sync" disabled={busy} onClick={() => mutate(async () => { check(await api.post('/dict/seed', {})); setMessage('已同步内置词库，自建与已编辑词条保留。'); })}>同步内置词库</button>
      </div>
      <div role="tablist" aria-label="创作字典分组" className="dictionary-page__tabs">
        {fields.map(field => <button key={field.key} role="tab" aria-selected={activeField === field.key} onClick={() => { setActiveField(field.key); setSearch(''); setEditingKey(undefined); }}>{field.label}</button>)}
      </div>
      <div className="dictionary-page__context">
        <p>{currentField.description}</p><span>{search ? visible.length + ' / ' : ''}{entries.length} 项</span>
      </div>
      <div className="dictionary-page__tools">
        <input aria-label="搜索字典词条" placeholder={'搜索' + currentField.label} value={search} onChange={event => setSearch(event.target.value)} />
        <div className="dictionary-page__add">
          <input aria-label="新增字典词条" placeholder={'补充' + currentField.label + '词条'} value={newLabel} onChange={event => setNewLabel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !busy) add(); }} />
          <button className="dictionary-page__primary" disabled={busy || !newLabel.trim()} onClick={add}>添加</button>
        </div>
      </div>
      {message && <p role="status" className="dictionary-page__message">{message}</p>}
    </header>
    <div ref={listRef} role="tabpanel" aria-label={currentField.label} className="dictionary-page__list custom-scrollbar" tabIndex={0}>
      {visible.length === 0 && <p className="dictionary-page__empty">没有匹配词条。</p>}
      {visible.map(entry => <article key={entry.key} className="dictionary-page__entry">
        <div className="dictionary-page__entry-heading">
          {editingKey === entry.key ? <>
            <input aria-label="编辑字典词条" value={editLabel} onChange={event => setEditLabel(event.target.value)} />
            <button className="dictionary-page__edit" disabled={busy || !editLabel.trim()} onClick={() => save(entry)}>保存</button>
            <button onClick={() => setEditingKey(undefined)}>取消</button>
          </> : <>
            <strong>{entry.label}</strong>
            <button className="dictionary-page__edit" disabled={busy} onClick={() => { setEditingKey(entry.key); setEditLabel(entry.rows[0]?.label || entry.label); }}>编辑</button>
            <button className="dictionary-page__delete" disabled={busy} onClick={() => remove(entry)}>删除</button>
          </>}
        </div>
        {entry.hint && <p>{entry.hint}</p>}
      </article>)}
    </div>
  </div>;
};
export default DictionaryPage;
