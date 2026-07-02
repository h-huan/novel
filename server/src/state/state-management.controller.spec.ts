import { describe, expect, it } from 'vitest';
import { StateManagementController } from './state-management.controller';

type Row = Record<string, any>;

class FakeStatement {
  constructor(private readonly db: FakeDb, private readonly sql: string) {}

  get(...params: any[]) {
    return this.db.get(this.sql, params);
  }

  all(...params: any[]) {
    return this.db.all(this.sql, params);
  }

  run(...params: any[]) {
    return this.db.run(this.sql, params);
  }
}

class FakeDb {
  state_confirmations: Row[] = [];
  chapters: Row[] = [];
  characters: Row[] = [];
  character_states: Row[] = [];
  outlines: Row[] = [];
  foreshadowings: Row[] = [];
  foreshadowing_states: Row[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  exec(_sql: string) {
    return undefined;
  }

  get(sql: string, params: any[]) {
    if (sql.includes('FROM state_confirmations') && sql.includes('AND id = ?')) {
      const [projectId, id] = params;
      return this.state_confirmations.find(row => row.project_id === projectId && row.id === id);
    }
    if (sql.includes('FROM chapters WHERE id = ?')) {
      const [id] = params;
      return this.chapters.find(row => row.id === id);
    }
    if (sql.includes('FROM characters') && sql.includes('AND id = ?')) {
      const [projectId, id] = params;
      return this.characters.find(row => row.project_id === projectId && row.id === id);
    }
    if (sql.includes('FROM outlines') && sql.includes('AND id = ?')) {
      const [projectId, id] = params;
      return this.outlines.find(row => row.project_id === projectId && row.id === id);
    }
    if (sql.includes('FROM foreshadowings') && sql.includes('AND id = ?')) {
      const [projectId, id] = params;
      return this.foreshadowings.find(row => row.project_id === projectId && row.id === id);
    }
    return undefined;
  }

  all(sql: string, params: any[]) {
    if (sql.includes('FROM state_confirmations') && sql.includes("status = 'pending'")) {
      const [projectId, ...ids] = params;
      return this.state_confirmations.filter(row =>
        row.project_id === projectId && row.status === 'pending' && ids.includes(row.id),
      );
    }
    return [];
  }

  run(sql: string, params: any[]) {
    if (sql.includes("SET status = 'confirmed'")) {
      const [actor, projectId, id] = params;
      const row = this.state_confirmations.find(item => item.project_id === projectId && item.id === id);
      if (!row) return { changes: 0 };
      row.status = 'confirmed';
      row.confirmed_by = actor;
      row.confirmed_at = 'now';
      return { changes: 1 };
    }

    if (sql.includes('UPDATE characters')) {
      const [arc, background, updatedAt, projectId, id] = params;
      const row = this.characters.find(item => item.project_id === projectId && item.id === id);
      if (!row) return { changes: 0 };
      row.arc = arc;
      row.background = background;
      row.updated_at = updatedAt;
      return { changes: 1 };
    }

    if (sql.includes('UPDATE outlines')) {
      const [content, plotPoints, updatedAt, projectId, id] = params;
      const row = this.outlines.find(item => item.project_id === projectId && item.id === id);
      if (!row) return { changes: 0 };
      row.content = content;
      row.plot_points = plotPoints;
      row.updated_at = updatedAt;
      return { changes: 1 };
    }

    if (sql.includes('UPDATE foreshadowings')) {
      const [content, updatedAt, projectId, id] = params;
      const row = this.foreshadowings.find(item => item.project_id === projectId && item.id === id);
      if (!row) return { changes: 0 };
      row.content = content;
      if (row.status === 'pending') row.status = 'buried';
      row.updated_at = updatedAt;
      return { changes: 1 };
    }

    if (sql.includes('UPDATE state_confirmations') && sql.includes('target_type')) {
      const [targetType, targetId, targetLabel, projectId, id] = params;
      const row = this.state_confirmations.find(item => item.project_id === projectId && item.id === id && item.status === 'pending');
      if (!row) return { changes: 0 };
      if (targetType) row.target_type = targetType;
      if (targetId) row.target_id = targetId;
      if (targetLabel) row.target_label = targetLabel;
      return { changes: 1 };
    }

    if (sql.includes('UPDATE character_states') || sql.includes('UPDATE plot_progress') || sql.includes('UPDATE foreshadowing_states')) {
      return { changes: 1 };
    }

    return { changes: 1 };
  }
}

function createController(db: FakeDb) {
  return new StateManagementController(
    { getDb: () => db } as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('StateManagementController confirmation writeback', () => {
  it('writes confirmed character updates into the bound character arc', () => {
    const db = new FakeDb();
    db.chapters.push({ id: 'chapter-1', chapter_index: 8, volume_index: 1 });
    db.characters.push({ id: 'char-1', project_id: 'project-1', arc: '[]', background: 'old background' });
    db.state_confirmations.push({
      id: 'confirm-1',
      project_id: 'project-1',
      source_chapter_id: 'chapter-1',
      target_type: 'character',
      target_id: 'char-1',
      target_label: 'Hero',
      summary: 'Hero learns the truth.',
      payload: JSON.stringify({ title: 'truth beat', summary: 'Hero learns the truth.' }),
      status: 'pending',
    });

    const result = createController(db).confirmStateChange('project-1', 'confirm-1', { confirmedBy: 'author' });

    expect(result.success).toBe(true);
    expect(db.state_confirmations[0].status).toBe('confirmed');
    expect(JSON.parse(db.characters[0].arc)).toHaveLength(1);
    expect(db.characters[0].background).toContain('Hero learns the truth.');
  });

  it('updates a bound outline instead of creating a duplicate note', () => {
    const db = new FakeDb();
    db.chapters.push({ id: 'chapter-1', chapter_index: 3, volume_index: 1 });
    db.outlines.push({ id: 'outline-1', project_id: 'project-1', content: 'old outline', plot_points: '[]' });
    db.state_confirmations.push({
      id: 'confirm-1',
      project_id: 'project-1',
      source_chapter_id: 'chapter-1',
      target_type: 'outline',
      target_id: 'outline-1',
      target_label: 'Chapter outline',
      summary: 'Add the reversal.',
      payload: '{}',
      status: 'pending',
    });

    createController(db).confirmStateChange('project-1', 'confirm-1', { confirmedBy: 'author' });

    expect(db.outlines[0].content).toContain('Add the reversal.');
    expect(JSON.parse(db.outlines[0].plot_points)).toHaveLength(1);
  });

  it('allows a pending confirmation to be manually bound before confirmation', () => {
    const db = new FakeDb();
    db.state_confirmations.push({
      id: 'confirm-1',
      project_id: 'project-1',
      target_type: 'outline',
      target_id: null,
      target_label: 'Unbound',
      status: 'pending',
    });

    const result = createController(db).updateConfirmationTarget('project-1', 'confirm-1', {
      targetType: 'character',
      targetId: 'char-1',
      targetLabel: '角色 · Hero',
    });

    expect(result.success).toBe(true);
    expect(db.state_confirmations[0].target_type).toBe('character');
    expect(db.state_confirmations[0].target_id).toBe('char-1');
  });
});
