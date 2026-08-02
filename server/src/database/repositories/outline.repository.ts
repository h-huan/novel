/**
 * 大纲 Repository
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

export interface OutlineRow {
  id: string;
  project_id: string;
  level: string;
  parent_id: string | null;
  order: number;
  title: string;
  content: string;
  chapter_function: string;
  goal_arc: string;
  target_words: number;
  actual_words: number | null;
  foreshadowing_ids: string;
  plot_points: string;
  status: string;
  character_ids: string;
  scenes: string | null;
  volumes: string | null;
  book_skeleton: string | null;
  chapter_type: string;
  pov_ratio: string;
  hot_scenes: string;
  setback_scenes: string;
  ending_setup: string;
  data_tracking: string;
  highlight_points: string;
  system_hints: string;
  timeline: string;
  location_summary: string;
  conflict_design: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class OutlineRepository extends BaseRepository<OutlineRow> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'outlines');
  }

  /**
   * 按项目ID查询
   */
  findByProjectId(projectId: string): OutlineRow[] {
    return this.findByField('project_id', projectId);
  }

  /**
   * 按层级查询   */
  findByLevel(projectId: string, level: string): OutlineRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM outlines
      WHERE project_id = ? AND level = ?
      ORDER BY "order" ASC
    `);
    return stmt.all(projectId, level) as unknown as OutlineRow[];
  }

  /**
   * 查询子节点   */
  findChildren(parentId: string): OutlineRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM outlines
      WHERE parent_id = ?
      ORDER BY "order" ASC
    `);
    return stmt.all(parentId) as unknown as OutlineRow[];
  }

  /**
   * 获取完整树形结构 (递归)
   */
  getTree(projectId: string): OutlineRow[] {
    const roots = this.db.prepare(`
      SELECT * FROM outlines
      WHERE project_id = ? AND parent_id IS NULL
      ORDER BY "order" ASC
    `).all(projectId) as unknown as OutlineRow[];

    return roots.map((root) => this.buildTreeNode(root));
  }

  private buildTreeNode(node: OutlineRow): OutlineRow & { children?: OutlineRow[] } {
    const children = this.findChildren(node.id);
    if (children.length === 0) return node;
    return { ...node, children: children.map((c) => this.buildTreeNode(c)) } as any;
  }

  /**
   * 移动节点到新父节点(拖拽排序)
   */
  moveNode(nodeId: string, newParentId: string | null, newOrder: number): OutlineRow | undefined {
    this.db.prepare(
      `UPDATE outlines SET parent_id = ?, "order" = ?, updated_at = ? WHERE id = ?`
    ).run(newParentId, newOrder, new Date().toISOString(), nodeId);

    return this.findById(nodeId);
  }

  /**
   * 重排序子节点
   */
  reorderChildren(parentId: string, orderedIds: string[]): void {
    try {
      this.db.exec('BEGIN');
      orderedIds.forEach((id, index) => {
        this.db.prepare(
          `UPDATE outlines SET "order" = ?, updated_at = ? WHERE id = ?`
        ).run(index, new Date().toISOString(), id);
      });
      this.db.exec('COMMIT');
    } catch {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
    }
  }

  /**
   * 获取关联的章节ID列表
   */
  getChapterIds(outlineId: string): string[] {
    const rows = this.db.prepare(
      'SELECT id FROM chapters WHERE outline_id = ?'
    ).all(outlineId) as { id: string }[];
    return rows.map((r) => r.id);
  }

  /**
   * 更新章节状态   */
  updateStatus(id: string, status: string): void {
    this.db.prepare(
      `UPDATE outlines SET status = ?, updated_at = ? WHERE id = ?`
    ).run(status, new Date().toISOString(), id);
  }
}
