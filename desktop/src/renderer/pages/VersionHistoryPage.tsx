import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

type Chapter = { id: string; volumeIndex: number; chapterIndex: number; title: string; content?: string; wordCount?: number };
type Version = { id: string; version: number; snapshot: string; checksum?: string; changeSummary?: string; createdBy?: string; createdAt?: string };

const payload = (response: any) => response?.data ?? response;
const wordCount = (text: string) => (text.match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g) || []).length;

const VersionHistoryPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState(searchParams.get('chapter') || '');
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentContent, setCurrentContent] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const selectedChapter = useMemo(() => chapters.find(chapter => chapter.id === chapterId), [chapters, chapterId]);
  const displayedContent = selectedVersion === null
    ? currentContent
    : versions.find(version => version.version === selectedVersion)?.snapshot || '';

  const loadChapters = useCallback(async () => {
    if (!projectId) return;
    const result = payload(await api.get(`/projects/${projectId}/chapters`));
    const list = Array.isArray(result) ? result : result.chapters || [];
    setChapters(list);
    setChapterId(current => current || list[0]?.id || '');
  }, [projectId]);

  const loadHistory = useCallback(async () => {
    if (!projectId || !chapterId) return;
    setLoading(true);
    setMessage('');
    try {
      const [chapterResult, historyResult] = await Promise.all([
        api.get(`/projects/${projectId}/chapters/${chapterId}`),
        api.get(`/projects/${projectId}/chapters/${chapterId}/versions`),
      ]);
      const chapter = payload(chapterResult) as Chapter;
      const history = payload(historyResult);
      setCurrentContent(chapter.content || '');
      setVersions(Array.isArray(history) ? history : history.versions || []);
      setSelectedVersion(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取该章节的真实版本记录');
    } finally {
      setLoading(false);
    }
  }, [chapterId, projectId]);

  useEffect(() => { void loadChapters(); }, [loadChapters]);
  useEffect(() => { if (chapterId) void loadHistory(); }, [chapterId, loadHistory]);

  const chooseChapter = (id: string) => {
    setChapterId(id);
    setSearchParams(id ? { chapter: id } : {});
  };

  const restore = async (version: number) => {
    if (!projectId || !chapterId) return;
    if (!window.confirm(`恢复到版本 ${version} 会先自动保存当前正文快照。确定恢复吗？`)) return;
    setLoading(true);
    setMessage('');
    try {
      const result = payload(await api.post(`/projects/${projectId}/chapters/${chapterId}/versions/${version}/restore`, {}));
      const syncWarning = result?.derivedSync?.warning || result?.stateSync?.warning;
      setMessage(syncWarning ? `正文已恢复，但${syncWarning}` : `已恢复到版本 ${version}，当前正文已重新同步。`);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败；当前正文未被覆盖');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <button style={styles.link} onClick={() => navigate(`/project/${projectId}/writing${chapterId ? `?chapter=${chapterId}` : ''}`)}>返回正文</button>
          <h1 style={styles.title}>修改记录</h1>
          <p style={styles.subtitle}>这里读取数据库中该章节的真实正文快照；不会创建内存里的临时版本。</p>
        </div>
        <button style={styles.refresh} onClick={() => void loadHistory()} disabled={loading || !chapterId}>{loading ? '读取中…' : '刷新'}</button>
      </header>

      <label style={styles.label}>核对章节
        <select value={chapterId} onChange={event => chooseChapter(event.target.value)} style={styles.select}>
          {chapters.length === 0 && <option value="">暂无章节</option>}
          {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第{chapter.chapterIndex}章《{chapter.title || '未命名'}》</option>)}
        </select>
      </label>

      {message && <div style={styles.notice}>{message}</div>}
      {selectedChapter && <div style={styles.chapterInfo}>当前归属：第{selectedChapter.chapterIndex}章《{selectedChapter.title || '未命名'}》</div>}

      <main style={styles.grid}>
        <section style={styles.history}>
          <button style={{ ...styles.version, ...(selectedVersion === null ? styles.activeVersion : {}) }} onClick={() => setSelectedVersion(null)}>
            <strong>当前正文</strong><span>{wordCount(currentContent)} 字</span>
          </button>
          {versions.length === 0 ? <p style={styles.empty}>尚无历史快照。正文每次保存、送审或锁定前会自动保存已有内容。</p> : versions.map(version => (
            <div key={version.id} style={{ ...styles.version, ...(selectedVersion === version.version ? styles.activeVersion : {}) }}>
              <button style={styles.versionSelect} onClick={() => setSelectedVersion(version.version)}>
                <strong>版本 {version.version}</strong><span>{new Date(version.createdAt || '').toLocaleString()} · {wordCount(version.snapshot || '')} 字</span>
                <small>{version.changeSummary || '正文快照'}</small>
              </button>
              <button style={styles.restore} onClick={() => void restore(version.version)} disabled={loading}>恢复</button>
            </div>
          ))}
        </section>
        <section style={styles.reader}>
          <div style={styles.readerHeader}><strong>{selectedVersion === null ? '当前正文' : `版本 ${selectedVersion} 正文`}</strong><span>{wordCount(displayedContent)} 字</span></div>
          {displayedContent ? <article style={styles.prose}>{displayedContent}</article> : <p style={styles.empty}>该版本没有可阅读的正文内容。</p>}
        </section>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: { height: '100%', overflow: 'auto', padding: 24, color: '#e9ecf6', background: '#11162a' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 },
  link: { padding: 0, color: '#9db5ff', border: 0, background: 'transparent', cursor: 'pointer' }, title: { margin: '8px 0 4px', fontSize: 22 }, subtitle: { margin: 0, color: '#9ea8c6', fontSize: 13 },
  refresh: { padding: '8px 14px', borderRadius: 6, color: '#fff', border: '1px solid #e94560', background: '#e94560', cursor: 'pointer' }, label: { display: 'grid', gap: 6, maxWidth: 560, fontSize: 13, color: '#aeb8d7' },
  select: { padding: '9px 10px', color: '#edf0fb', background: '#1b213a', border: '1px solid #3a456d', borderRadius: 6 }, notice: { margin: '14px 0', padding: 10, color: '#ffd891', border: '1px solid #7d5e28', background: '#2d261c', borderRadius: 6 }, chapterInfo: { margin: '14px 0', color: '#aab5d3' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(250px, 34%) minmax(0, 1fr)', gap: 16, minHeight: 520 }, history: { display: 'grid', alignContent: 'start', gap: 8 }, version: { display: 'flex', border: '1px solid #303b60', borderRadius: 8, overflow: 'hidden', background: '#181e34' }, activeVersion: { borderColor: '#e94560', background: '#29203a' },
  versionSelect: { minWidth: 0, flex: 1, display: 'grid', gap: 4, textAlign: 'left', padding: 12, border: 0, color: '#ecf0ff', background: 'transparent', cursor: 'pointer' }, restore: { margin: 10, padding: '4px 10px', alignSelf: 'center', color: '#ffd37a', border: '1px solid #8c682c', borderRadius: 5, background: 'transparent', cursor: 'pointer' },
  reader: { border: '1px solid #303b60', borderRadius: 8, background: '#171c31', minWidth: 0 }, readerHeader: { display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #303b60', color: '#c6d0eb' }, prose: { margin: 0, padding: 22, whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 2, color: '#f2f4fc' }, empty: { padding: 18, color: '#95a0c0', fontSize: 13, lineHeight: 1.7 },
};

export default VersionHistoryPage;
