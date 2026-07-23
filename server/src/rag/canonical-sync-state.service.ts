import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmbeddingService } from './embedding.service';
import { VectorIndexService } from './vector-index.service';
import { StateItemService } from '../state/state-item.service';

export interface CanonicalSyncResult {
  entityType: string;
  entityId: string;
  indexStatus: 'completed' | 'warning';
  needsResync: boolean;
  lastError?: string;
}

@Injectable()
export class CanonicalSyncStateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly embedding: EmbeddingService,
    private readonly vectorIndex: VectorIndexService,
    @Optional() private readonly stateItems?: StateItemService,
  ) {}

  async run(
    projectId: string,
    entityType: string,
    entityId: string,
    work: () => Promise<void>,
  ): Promise<CanonicalSyncResult> {
    this.write(projectId, entityType, entityId, 'pending', true, null, null);
    try {
      await work();
      const syncedAt = new Date().toISOString();
      this.write(projectId, entityType, entityId, 'completed', false, null, syncedAt);
      return { entityType, entityId, indexStatus: 'completed', needsResync: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.write(projectId, entityType, entityId, 'warning', true, message, null);
      return { entityType, entityId, indexStatus: 'warning', needsResync: true, lastError: message };
    }
  }

  list(projectId: string): any[] {
    return this.database.getDb().prepare(`
      SELECT project_id AS projectId, entity_type AS entityType, entity_id AS entityId,
             index_status AS indexStatus, needs_resync AS needsResync,
             last_error AS lastError, last_attempt_at AS lastAttemptAt,
             synced_at AS syncedAt, updated_at AS updatedAt
      FROM canonical_entity_sync_states
      WHERE project_id = ?
      ORDER BY needs_resync DESC, updated_at DESC
    `).all(projectId).map((row: any) => ({ ...row, needsResync: Boolean(row.needsResync) }));
  }

  listChapterDerived(projectId: string): any[] {
    return this.database.getDb().prepare(`
      SELECT chapter_id AS entityId, vector_sync_status AS indexStatus,
             needs_resync AS needsResync, last_error AS lastError,
             last_attempt_at AS lastAttemptAt, updated_at AS updatedAt,
             summary_sync_status AS summaryStatus,
             foreshadowing_sync_status AS foreshadowingStatus,
             timeline_sync_status AS timelineStatus,
             outline_sync_status AS outlineStatus
      FROM chapter_derived_sync_states
      WHERE project_id = ?
      ORDER BY needs_resync DESC, updated_at DESC
    `).all(projectId).map((row: any) => ({
      ...row,
      entityType: 'chapter',
      needsResync: Boolean(row.needsResync),
    }));
  }

  retry(projectId: string, entityType: string, entityId: string): Promise<CanonicalSyncResult> {
    return this.run(projectId, entityType, entityId, async () => {
      if (entityType.startsWith('impact_')) {
        if (!this.stateItems) throw new Error('影响分析服务不可用');
        const targetType = entityType.slice('impact_'.length);
        this.stateItems.analyzeImpact(projectId, {
          targetType,
          targetId: entityId,
          summary: `${targetType} 人工修改影响分析重试`,
          payload: { operation: 'retry_impact_analysis', needsReview: true },
          createdBy: 'sync-retry',
        });
        return;
      }
      const source = this.loadSource(projectId, entityType, entityId);
      if (!source) throw new Error('权威数据不存在，无法重建索引');
      const [vector] = await this.embedding.embed([source.text]);
      await this.vectorIndex.indexChunksStrict(source.collection, [{
        chunk: {
          id: source.indexId,
          text: source.text,
          docType: source.docType as any,
          metadata: { chunkIndex: 0, parentDocId: entityId },
        },
        vector,
      }]);
    });
  }

  private loadSource(projectId: string, entityType: string, entityId: string): { collection: string; indexId: string; text: string; docType: string } | null {
    const db = this.database.getDb();
    if (entityType === 'character') {
      const row = db.prepare(`SELECT name,identity,personality,background,dialogue_style FROM characters WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      return row ? { collection: VectorIndexService.COLLECTIONS.CHARACTERS, indexId: entityId, text: [row.name,row.identity,row.personality,row.background,row.dialogue_style].filter(Boolean).join('\n'), docType: 'character_profile' } : null;
    }
    if (entityType === 'foreshadowing') {
      const row = db.prepare(`SELECT content,status,type,scope,recovery_condition,payoff_description,recovery_window_start,recovery_window_end,evidence_text,risk_level FROM foreshadowings WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      return row ? { collection: VectorIndexService.COLLECTIONS.FORESHADOWINGS, indexId: `foreshadowing:${entityId}`, text: Object.values(row).filter(Boolean).join('\n'), docType: 'foreshadowing' } : null;
    }
    if (entityType === 'world_setting') {
      const row = db.prepare(`SELECT name,era,geography,factions,rules,atmosphere,constraints FROM world_settings WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      return row ? { collection: VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, indexId: `world-setting:${entityId}`, text: Object.values(row).filter(Boolean).join('\n'), docType: 'world_setting' } : null;
    }
    if (entityType === 'outline') {
      const row = db.prepare(`SELECT title,content,chapter_function,goal_arc,scenes,detail_json,attention_json,plan_json FROM outlines WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      return row ? { collection: VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING, indexId: entityId, text: Object.values(row).filter(Boolean).join('\n'), docType: 'outline' } : null;
    }
    if (entityType === 'timeline') {
      const timeline = db.prepare(`SELECT name,description,start_date,end_date FROM timelines WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      if (!timeline) return null;
      const events = db.prepare(`SELECT event_date,title,description,event_type FROM timeline_events WHERE timeline_id=? ORDER BY event_date,created_at`).all(entityId) as any[];
      return { collection: VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, indexId: `timeline:${entityId}`, text: [...Object.values(timeline), ...events.flatMap(event => Object.values(event))].filter(Boolean).join('\n'), docType: 'timeline' };
    }
    if (entityType === 'organization') {
      const row = db.prepare(`SELECT name,type,description,parent_id,level FROM organizations WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      return row ? { collection: VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, indexId: `organization:${entityId}`, text: Object.values(row).filter(Boolean).join('\n'), docType: 'world_setting' } : null;
    }
    if (entityType === 'map_point') {
      const point = db.prepare(`SELECT name,type,description,parent_id,level,coordinates,linked_chapter_ids,linked_character_ids FROM map_points WHERE project_id=? AND id=?`).get(projectId, entityId) as any;
      if (!point) return null;
      const profile = db.prepare(`SELECT * FROM location_knowledge_profiles WHERE project_id=? AND map_point_id=?`).get(projectId, entityId) as any;
      const relations = db.prepare(`SELECT target_location_id,relation_type,relation_description,distance_cost,travel_time,travel_method,risk_level,access_condition FROM location_knowledge_relations WHERE project_id=? AND source_location_id=?`).all(projectId, entityId) as any[];
      const values = [
        ...Object.values(point),
        ...Object.entries(profile || {}).filter(([key]) => !['id','project_id','map_point_id','created_at','updated_at'].includes(key)).map(([, value]) => value),
        ...relations.flatMap(relation => Object.values(relation)),
      ];
      return { collection: VectorIndexService.COLLECTIONS.GLOBAL_KNOWLEDGE, indexId: `map-point:${entityId}`, text: values.filter(Boolean).join('\n'), docType: 'world_setting' };
    }
    throw new Error(`不支持的同步类型：${entityType}`);
  }

  private write(
    projectId: string,
    entityType: string,
    entityId: string,
    indexStatus: string,
    needsResync: boolean,
    lastError: string | null,
    syncedAt: string | null,
  ): void {
    const now = new Date().toISOString();
    this.database.getDb().prepare(`
      INSERT INTO canonical_entity_sync_states
        (project_id, entity_type, entity_id, index_status, needs_resync, last_error, last_attempt_at, synced_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, entity_type, entity_id) DO UPDATE SET
        index_status = excluded.index_status,
        needs_resync = excluded.needs_resync,
        last_error = excluded.last_error,
        last_attempt_at = excluded.last_attempt_at,
        synced_at = COALESCE(excluded.synced_at, canonical_entity_sync_states.synced_at),
        updated_at = excluded.updated_at
    `).run(projectId, entityType, entityId, indexStatus, needsResync ? 1 : 0, lastError, now, syncedAt, now);
  }
}
