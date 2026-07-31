/**
 * KnowledgePoints - 知识点（写作经验 / 避坑经验）面板
 *
 * 与「前后矛盾」面板并列的 tab。数据来自后端 generation_lessons 表：
 *   - 一部分由章节生成后的跨章节学习回路自动归纳写入；
 *   - 作者可在此逐条（非批量）手动 新增 / 修改 / 删除。
 * 这些知识点会被注入到后续章节的生成提示中，因此作者维护的内容会直接影响 AI 写作。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Lesson {
  id: string;
  project_id: string;
  category: string;
  lesson: string;
  occurrence: number;
  last_chapter_index: number | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS = [
  { value: 'missing_scene', label: '漏场景/事件' },
  { value: 'early_termination', label: '提前终止/未到结尾' },
  { value: 'character_conflict', label: '角色冲突' },
  { value: 'viewpoint_drift', label: '视角漂移' },
  { value: 'hook_missing', label: '漏结尾钩子' },
  { value: 'writing_tip', label: '写作经验' },
  { value: 'other', label: '其他' },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label]),
);
const CATEGORY_COLOR: Record<string, string> = {
  missing_scene: '#f39c12',
  early_termination: '#e67e22',
  character_conflict: '#e94560',
  viewpoint_drift: '#9b59b6',
  hook_missing: '#3498db',
  writing_tip: '#2ecc71',
  other: '#8a8aa0',
};

const KnowledgePoints: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 新增表单
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState('writing_tip');
  const [newLesson, setNewLesson] = useState('');

  // 行内编辑
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('other');
  const [editLesson, setEditLesson] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ lessons?: Lesson[]; error?: string }>(
        `/generation-lessons?projectId=${projectId}`,
      );
      // 与 ConflictDashboard 保持一致：兼容「后端直接返回对象」与「{data,message} 包装」两种结构
      const data = (res as any).data ?? res;
      if (data.error) {
        setError(data.error);
        setLessons([]);
      } else {
        setLessons(data.lessons || []);
      }
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleAdd = async () => {
    const lesson = newLesson.trim();
    if (!lesson) {
      showNotice('知识点内容不能为空');
      return;
    }
    try {
      const res = await api.post<{ lesson?: Lesson; merged?: boolean; error?: string }>(
        '/generation-lessons',
        { projectId, category: newCategory, lesson },
      );
      const data = (res as any).data ?? res;
      if (data.error) {
        showNotice(data.error);
        return;
      }
      setNewLesson('');
      setAdding(false);
      await load();
      showNotice(data.merged ? '已合并到已有相似条目（措辞重复，计数+1）' : '已新增知识点');
    } catch (err: any) {
      showNotice(err?.message || '新增失败');
    }
  };

  const startEdit = (row: Lesson) => {
    setEditingId(row.id);
    setEditCategory(row.category);
    setEditLesson(row.lesson);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLesson('');
  };

  const handleSaveEdit = async (rowId: string) => {
    const lesson = editLesson.trim();
    if (!lesson) {
      showNotice('知识点内容不能为空');
      return;
    }
    try {
      const res = await api.put<{ lesson?: Lesson; error?: string }>(
        `/generation-lessons/${rowId}`,
        { projectId, category: editCategory, lesson },
      );
      const data = (res as any).data ?? res;
      if (data.error) {
        showNotice(data.error);
        return;
      }
      setEditingId(null);
      await load();
      showNotice('已保存修改');
    } catch (err: any) {
      showNotice(err?.message || '保存失败');
    }
  };

  const handleDelete = async (rowId: string) => {
    if (!window.confirm('确定删除这条知识点？此操作不可撤销。')) return;
    try {
      const res = await api.delete<{ deleted?: number; error?: string }>(
        `/generation-lessons/${rowId}?projectId=${projectId}`,
      );
      const data = (res as any).data ?? res;
      if (data.error) {
        showNotice(data.error);
        return;
      }
      await load();
      showNotice('已删除');
    } catch (err: any) {
      showNotice(err?.message || '删除失败');
    }
  };

  const topOccurrence = lessons.reduce((m, l) => Math.max(m, l.occurrence), 0);
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '—';

  return (
    <div style={{ minHeight: '100vh', background: '#15151c', color: '#eaeaea', padding: '24px 32px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>💡 知识点（写作经验 / 避坑经验）</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={load}
              disabled={loading}
              style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
            <button
              onClick={() => { setAdding(v => !v); setNotice(null); }}
              style={{ background: '#0d3320', color: '#d1f7c4', border: '1px solid #2ecc71', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}
            >
              {adding ? '取消新增' : '+ 添加知识点'}
            </button>
          </div>
        </div>

        <p style={{ fontSize: '12px', color: '#9a9ab0', margin: '0 0 14px' }}>
          这里汇总本项目自动归纳的避坑经验与你手动沉淀的写作经验；它们会被注入后续章节的生成提示，
          让 AI 在写作时主动规避已知问题。支持逐条手动新增、修改、删除（不可批量）。
        </p>

        {notice && (
          <div style={{ background: '#1d2a3a', color: '#bcd9ff', border: '1px solid #3a6ea5', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '13px' }}>
            {notice}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: '知识点总数', value: lessons.length, color: '#eaeaea' },
            { label: '最高出现频次', value: topOccurrence, color: '#f39c12' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1e1e28', border: '1px solid #2e2e3a', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
              <div style={{ fontSize: '11px', color: '#9a9ab0' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {error && <div style={{ color: '#ffd1d8', background: '#3b1418', border: '1px solid #e94560', borderRadius: 6, padding: '10px 12px' }}>{error}</div>}

        {/* 新增表单 */}
        {adding && (
          <div style={{ background: '#1e1e28', border: '1px solid #2ecc71', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '6px 8px' }}
              >
                {CATEGORY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={newLesson}
              onChange={e => setNewLesson(e.target.value)}
              placeholder="输入一条经验，例如：正文最后一个场景必须落在结尾钩子场景上收尾，不得提前终止于用餐/通勤等中间事件。"
              rows={3}
              style={{ width: '100%', background: '#15151c', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: 10, resize: 'vertical', fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdding(false)} style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleAdd} style={{ background: '#0d3320', color: '#d1f7c4', border: '1px solid #2ecc71', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>保存</button>
            </div>
          </div>
        )}

        {/* 列表 */}
        {!loading && !error && lessons.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9a9ab0', padding: 40 }}>
            暂无知识点。点击下方「+ 添加知识点」手动沉淀经验，或继续写作让系统自动归纳避坑经验。
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lessons.map(row => {
            const isEditing = editingId === row.id;
            return (
              <div key={row.id} style={{ background: '#1e1e28', border: '1px solid #2e2e3a', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 10, color: '#15151c', background: CATEGORY_COLOR[row.category] || '#8a8aa0', fontWeight: 600 }}>
                    {CATEGORY_LABEL[row.category] || row.category}
                  </span>
                  <span style={{ fontSize: '11px', color: '#9a9ab0' }}>出现 {row.occurrence} 次</span>
                  {!isEditing && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(row)} style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>编辑</button>
                      <button onClick={() => handleDelete(row.id)} style={{ background: '#3b1418', color: '#ffd1d8', border: '1px solid #e94560', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>删除</button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <select
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}
                    >
                      {CATEGORY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <textarea
                      value={editLesson}
                      onChange={e => setEditLesson(e.target.value)}
                      rows={3}
                      style={{ width: '100%', background: '#15151c', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: 10, resize: 'vertical', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={cancelEdit} style={{ background: '#2a2a36', color: '#eaeaea', border: '1px solid #3a3a48', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>取消</button>
                      <button onClick={() => handleSaveEdit(row.id)} style={{ background: '#0d3320', color: '#d1f7c4', border: '1px solid #2ecc71', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>保存</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#eaeaea', whiteSpace: 'pre-wrap' }}>{row.lesson}</p>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#7a7a90' }}>
                      最近更新：{fmt(row.updated_at)}
                      {row.last_chapter_index != null ? ` · 最近关联章节 ${row.last_chapter_index}` : ''}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnowledgePoints;
