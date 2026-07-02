/**
 * TimelinePage - 时间线管理页面
 * 展示和编辑项目的时间线与事件
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Timeline {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface TimelineEvent {
  id: string;
  timelineId: string;
  title: string;
  description?: string;
  eventDate?: string;
  eventType: string;
  importance: number;
  relatedCharacterIds: string[];
  relatedChapterIds: string[];
  createdAt: string;
  updatedAt: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  story: '故事事件',
  character: '角色事件',
  world: '世界观事件',
  custom: '自定义',
};

const TimelinePage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [currentTimeline, setCurrentTimeline] = useState<Timeline | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 创建/编辑对话框
  const [showTimelineDialog, setShowTimelineDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editingTimeline, setEditingTimeline] = useState<Timeline | null>(null);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  // 表单状态
  const [timelineForm, setTimelineForm] = useState({ name: '', description: '', startDate: '', endDate: '' });
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    eventDate: '',
    eventType: 'story',
    importance: 1,
  });

  // 加载时间线列表
  const fetchTimelines = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await api.get<Timeline[]>(`/projects/${projectId}/timelines`);
      const data = (res as any).data || res;
      setTimelines(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载时间线失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 加载时间线事件
  const fetchEvents = useCallback(async (timelineId: string) => {
    try {
      const res = await api.get<TimelineEvent[]>(`/projects/${projectId}/timelines/${timelineId}/events`);
      const data = (res as any).data || res;
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载事件失败');
    }
  }, [projectId]);

  useEffect(() => {
    fetchTimelines();
  }, [fetchTimelines]);

  // 选择时间线
  const handleSelectTimeline = useCallback((timeline: Timeline) => {
    setCurrentTimeline(timeline);
    fetchEvents(timeline.id);
  }, [fetchEvents]);

  // 创建/更新时间线
  const handleSaveTimeline = useCallback(async () => {
    try {
      if (editingTimeline) {
        await api.put(`/projects/${projectId}/timelines/${editingTimeline.id}`, timelineForm);
      } else {
        await api.post(`/projects/${projectId}/timelines`, timelineForm);
      }
      setShowTimelineDialog(false);
      setEditingTimeline(null);
      setTimelineForm({ name: '', description: '', startDate: '', endDate: '' });
      fetchTimelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }, [projectId, editingTimeline, timelineForm, fetchTimelines]);

  // 删除时间线
  const handleDeleteTimeline = useCallback(async (timelineId: string) => {
    if (!confirm('确定要删除这个时间线吗？')) return;
    try {
      await api.delete(`/projects/${projectId}/timelines/${timelineId}`);
      if (currentTimeline?.id === timelineId) {
        setCurrentTimeline(null);
        setEvents([]);
      }
      fetchTimelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }, [projectId, currentTimeline, fetchTimelines]);

  // 创建/更新事件
  const handleSaveEvent = useCallback(async () => {
    if (!currentTimeline) return;
    try {
      if (editingEvent) {
        await api.put(
          `/projects/${projectId}/timelines/${currentTimeline.id}/events/${editingEvent.id}`,
          eventForm
        );
      } else {
        await api.post(`/projects/${projectId}/timelines/${currentTimeline.id}/events`, eventForm);
      }
      setShowEventDialog(false);
      setEditingEvent(null);
      setEventForm({ title: '', description: '', eventDate: '', eventType: 'story', importance: 1 });
      fetchEvents(currentTimeline.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }, [projectId, currentTimeline, editingEvent, eventForm, fetchEvents]);

  // 删除事件
  const handleDeleteEvent = useCallback(async (eventId: string) => {
    if (!currentTimeline) return;
    if (!confirm('确定要删除这个事件吗？')) return;
    try {
      await api.delete(`/projects/${projectId}/timelines/${currentTimeline.id}/events/${eventId}`);
      fetchEvents(currentTimeline.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }, [projectId, currentTimeline, fetchEvents]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* 顶部栏 */}
      <div style={styles.header}>
        <h2 style={styles.title}>⏰ 时间线</h2>
        <button
          style={styles.createBtn}
          onClick={() => {
            setEditingTimeline(null);
            setTimelineForm({ name: '', description: '', startDate: '', endDate: '' });
            setShowTimelineDialog(true);
          }}
        >
          + 创建时间线
        </button>
      </div>

      {error && (
        <div style={styles.error}>{error}</div>
      )}

      <div style={styles.content}>
        {/* 时间线列表 */}
        <div style={styles.timelineList}>
          <h3 style={styles.subtitle}>时间线列表</h3>
          {timelines.length === 0 ? (
            <div style={styles.empty}>暂无时间线，点击上方按钮创建</div>
          ) : (
            timelines.map((timeline) => (
              <div
                key={timeline.id}
                style={{
                  ...styles.timelineCard,
                  borderColor: currentTimeline?.id === timeline.id ? '#e94560' : 'rgba(255,255,255,0.06)',
                }}
                onClick={() => handleSelectTimeline(timeline)}
              >
                <div style={styles.timelineName}>{timeline.name}</div>
                {timeline.description && (
                  <div style={styles.timelineDesc}>{timeline.description}</div>
                )}
                <div style={styles.timelineActions}>
                  <button
                    style={styles.actionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTimeline(timeline);
                      setTimelineForm({
                        name: timeline.name,
                        description: timeline.description || '',
                        startDate: timeline.startDate || '',
                        endDate: timeline.endDate || '',
                      });
                      setShowTimelineDialog(true);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    style={{ ...styles.actionBtn, color: '#e74c3c' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTimeline(timeline.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 事件列表 */}
        <div style={styles.eventList}>
          {currentTimeline ? (
            <>
              <div style={styles.eventHeader}>
                <h3 style={styles.subtitle}>{currentTimeline.name} - 事件</h3>
                <button
                  style={styles.createBtn}
                  onClick={() => {
                    setEditingEvent(null);
                    setEventForm({ title: '', description: '', eventDate: '', eventType: 'story', importance: 1 });
                    setShowEventDialog(true);
                  }}
                >
                  + 添加事件
                </button>
              </div>
              {events.length === 0 ? (
                <div style={styles.empty}>暂无事件，点击上方按钮添加</div>
              ) : (
                <div style={styles.eventTimeline}>
                  {events.map((event) => (
                    <div key={event.id} style={styles.eventCard}>
                      <div style={styles.eventDate}>
                        {event.eventDate || '未知日期'}
                      </div>
                      <div style={styles.eventContent}>
                        <div style={styles.eventTitle}>{event.title}</div>
                        {event.description && (
                          <div style={styles.eventDesc}>{event.description}</div>
                        )}
                        <div style={styles.eventMeta}>
                          <span style={styles.eventType}>{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</span>
                          <span style={styles.eventImportance}>重要性: {'⭐'.repeat(event.importance)}</span>
                        </div>
                        <div style={styles.eventActions}>
                          <button
                            style={styles.actionBtn}
                            onClick={() => {
                              setEditingEvent(event);
                              setEventForm({
                                title: event.title,
                                description: event.description || '',
                                eventDate: event.eventDate || '',
                                eventType: event.eventType,
                                importance: event.importance,
                              });
                              setShowEventDialog(true);
                            }}
                          >
                            编辑
                          </button>
                          <button
                            style={{ ...styles.actionBtn, color: '#e74c3c' }}
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={styles.empty}>请选择或创建一个时间线</div>
          )}
        </div>
      </div>

      {/* 时间线编辑对话框 */}
      {showTimelineDialog && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h3 style={styles.dialogTitle}>{editingTimeline ? '编辑时间线' : '创建时间线'}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>名称</label>
              <input
                style={styles.input}
                value={timelineForm.name}
                onChange={(e) => setTimelineForm({ ...timelineForm, name: e.target.value })}
                placeholder="输入时间线名称"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>描述</label>
              <textarea
                style={styles.textarea}
                value={timelineForm.description}
                onChange={(e) => setTimelineForm({ ...timelineForm, description: e.target.value })}
                placeholder="输入时间线描述（可选）"
              />
            </div>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>开始日期</label>
                <input
                  style={styles.input}
                  value={timelineForm.startDate}
                  onChange={(e) => setTimelineForm({ ...timelineForm, startDate: e.target.value })}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>结束日期</label>
                <input
                  style={styles.input}
                  value={timelineForm.endDate}
                  onChange={(e) => setTimelineForm({ ...timelineForm, endDate: e.target.value })}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
            <div style={styles.dialogActions}>
              <button style={styles.cancelBtn} onClick={() => setShowTimelineDialog(false)}>
                取消
              </button>
              <button style={styles.confirmBtn} onClick={handleSaveTimeline}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 事件编辑对话框 */}
      {showEventDialog && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h3 style={styles.dialogTitle}>{editingEvent ? '编辑事件' : '添加事件'}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>标题</label>
              <input
                style={styles.input}
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                placeholder="输入事件标题"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>日期</label>
              <input
                style={styles.input}
                value={eventForm.eventDate}
                onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>类型</label>
              <select
                style={styles.select}
                value={eventForm.eventType}
                onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>重要性 (1-5)</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="5"
                value={eventForm.importance}
                onChange={(e) => setEventForm({ ...eventForm, importance: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>描述</label>
              <textarea
                style={styles.textarea}
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                placeholder="输入事件描述（可选）"
              />
            </div>
            <div style={styles.dialogActions}>
              <button style={styles.cancelBtn} onClick={() => setShowEventDialog(false)}>
                取消
              </button>
              <button style={styles.confirmBtn} onClick={handleSaveEvent}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#16213e',
    color: '#eaeaea',
    overflow: 'hidden',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '14px',
    color: '#8a8aa0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#1a1a2e',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  createBtn: {
    padding: '8px 16px',
    backgroundColor: '#e94560',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    padding: '12px 24px',
    backgroundColor: 'rgba(231,76,60,0.1)',
    borderBottom: '1px solid rgba(231,76,60,0.2)',
    color: '#e74c3c',
    fontSize: '13px',
  },
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  timelineList: {
    width: '300px',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '16px',
    overflow: 'auto',
  },
  subtitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    color: '#8a8aa0',
    fontSize: '13px',
  },
  timelineCard: {
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '8px',
    transition: 'all 0.15s',
  },
  timelineName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
    marginBottom: '4px',
  },
  timelineDesc: {
    fontSize: '12px',
    color: '#8a8aa0',
    marginBottom: '8px',
  },
  timelineActions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#8a8aa0',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  eventList: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  eventTimeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  eventCard: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
  },
  eventDate: {
    minWidth: '100px',
    fontSize: '12px',
    color: '#8a8aa0',
    fontWeight: 600,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
    marginBottom: '4px',
  },
  eventDesc: {
    fontSize: '12px',
    color: '#8a8aa0',
    marginBottom: '8px',
  },
  eventMeta: {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px',
  },
  eventType: {
    padding: '2px 8px',
    backgroundColor: 'rgba(233,69,96,0.1)',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#e94560',
  },
  eventImportance: {
    fontSize: '11px',
    color: '#f59e0b',
  },
  eventActions: {
    display: 'flex',
    gap: '8px',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#1e1e32',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  dialogTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#8a8aa0',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical',
    minHeight: '60px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '16px',
  },
  cancelBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#8a8aa0',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#e94560',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

export default TimelinePage;
