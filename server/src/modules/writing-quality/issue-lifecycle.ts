import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const ACTIVE_ISSUE_SQL = "('open','planned','refined','recheck_failed')";

/** Layout-only edits do not invalidate the reviewed narrative. */
export function reviewedContentHash(content: string): string {
  return createHash('sha256').update(content.replace(/\s+/gu, '')).digest('hex');
}

/** Retire proven obsolete findings, never infer resolution from age or severity.
 * Newer, unsaved review candidates remain visible until the next canonical save.
 * Unknown legacy provenance remains active rather than being silently discarded.
 */
export function retireStaleIssues(db: DatabaseSync, projectId: string, chapterId?: string): number {
  const rows = db.prepare(`SELECT i.id,i.status,i.status_history_json,i.payload,i.issue_type,i.summary,
      c.chapter_index,
      r.status report_status,r.payload report_payload,r.updated_at reviewed_at,
      g.output_text,c.content,c.updated_at saved_at
    FROM writing_quality_issues i
    JOIN writing_quality_reports r ON r.id=i.report_id
    LEFT JOIN chapters c ON c.id=i.chapter_id AND c.project_id=i.project_id
    LEFT JOIN generation_runs g ON r.source_type='artifact_quality' AND g.id=r.source_id
      AND g.project_id=i.project_id AND g.stage='chapter' AND g.chapter_index=c.chapter_index
    WHERE i.project_id=? AND i.status IN ${ACTIVE_ISSUE_SQL}
      ${chapterId ? 'AND i.chapter_id=?' : ''}`)
    .all(...(chapterId ? [projectId, chapterId] : [projectId])) as any[];
  const parse = (value: string | null) => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
  const now = new Date().toISOString();
  const update = db.prepare(`UPDATE writing_quality_issues SET status='superseded',
    status_history_json=?,updated_at=? WHERE id=? AND status=?`);
  let count = 0;
  for (const row of rows) {
    let reason = row.report_status === 'superseded' ? 'report_superseded' : '';
    const details = parse(row.payload).details;
    const overdue = row.issue_type === 'consistency.plot_logic'
      && details?.items?.some((item: any) => item.field === 'foreshadowing')
      && String(row.summary || '').startsWith('伏笔已超过计划回收章节：');
    if (!reason && overdue) {
      // Exact legacy content match is allowed only when unambiguous in this project.
      const source = details.items.find((item: any) => item.field === 'foreshadowing');
      const facts = source.sourceId
        ? db.prepare('SELECT status,planned_recovery_chapter_index FROM foreshadowings WHERE project_id=? AND id=?')
          .all(projectId, source.sourceId) as any[]
        : db.prepare('SELECT status,planned_recovery_chapter_index FROM foreshadowings WHERE project_id=? AND content=?')
          .all(projectId, row.summary.slice('伏笔已超过计划回收章节：'.length)) as any[];
      if (facts.length === 1) {
        const fact = facts[0];
        if (['recovered', 'cancelled'].includes(fact.status)) reason = 'foreshadowing_closed';
        else if (fact.planned_recovery_chapter_index != null
          && fact.planned_recovery_chapter_index >= row.chapter_index) reason = 'foreshadowing_rescheduled';
      }
    }
    if (!reason && row.content != null && row.reviewed_at && row.saved_at
      && Date.parse(row.reviewed_at) <= Date.parse(row.saved_at)) {
      const hash = parse(row.payload).reviewedContentHash || parse(row.report_payload).reviewedContentHash
        || (row.output_text ? reviewedContentHash(row.output_text) : null);
      if (hash && hash !== reviewedContentHash(row.content)) reason = 'reviewed_content_replaced';
    }
    if (!reason) continue;
    const history = parse(row.status_history_json);
    const entries = Array.isArray(history) ? history : [];
    entries.push({ from: row.status, to: 'superseded', reason, at: now });
    count += Number(update.run(JSON.stringify(entries), now, row.id, row.status).changes);
  }
  return count;
}
