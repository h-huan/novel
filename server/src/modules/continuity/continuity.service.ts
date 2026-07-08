import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';

const STATE_TYPES = new Set(['physical', 'emotion', 'goal', 'identity', 'relationship', 'resource', 'secret', 'ability', 'restriction', 'reputation', 'location', 'arc']);
const REVIEW_STATUSES = new Set(['draft', 'pending', 'confirmed', 'ignored', 'conflict', 'archived']);
const RELATION_TYPES = new Set(['ally', 'enemy', 'family', 'mentor', 'disciple', 'superior', 'subordinate', 'rival', 'lover_like', 'debt', 'benefit', 'hidden', 'unknown', 'other']);
const READER_STATES = new Set(['unknown', 'hinted', 'known', 'misdirected']);
const CHARACTER_KNOWN_STATES = new Set(['unknown', 'partial', 'known', 'misunderstood']);
const RELATION_EVENT_TYPES = new Set(['established', 'deepened', 'conflicted', 'betrayed', 'reconciled', 'revealed', 'hidden', 'weakened', 'strengthened', 'other']);
const SOURCES = new Set(['manual', 'ai', 'chapter_extract']);

@Injectable()
export class ContinuityService {
  constructor(private readonly database: DatabaseService) {}

  getCharacters(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const outline = this.getFocusOutline(projectId, focusChapter);
    const characters = this.allCharacters(projectId);
    const snapshots = this.allStateSnapshots(projectId);
    const relationships = this.allRelationships(projectId);
    const focusIds = this.focusCharacterIds(characters, snapshots, relationships, focusChapter, outline);
    const responseItems = characters.map((character) => this.characterToResponse(character, snapshots, relationships, focusChapter));

    const focusCharacters = responseItems.filter(item => focusIds.has(item.id));
    const recentlyChanged = responseItems.filter(item => item.sourceChapterId).slice(0, 12);
    const pendingReview = responseItems.filter(item => item.pendingReviewCount > 0);
    const conflictRisk = responseItems.filter(item => item.riskTags.length > 0);
    const mainCharacters = responseItems.filter(item => item.isPovCharacter || ['protagonist', 'main'].includes(String(item.role || '')));

    return {
      success: true,
      focusChapter: focusChapter || null,
      summary: {
        totalCharacters: responseItems.length,
        focusCharacters: focusCharacters.length,
        pendingStateCount: snapshots.filter(s => s.review_status === 'pending').length,
        conflictStateCount: snapshots.filter(s => s.review_status === 'conflict' || !!s.conflict_risk).length,
        lockedStateCount: snapshots.filter(s => Number(s.locked) === 1).length,
        recentChangedCount: recentlyChanged.length,
      },
      groups: {
        focusCharacters,
        mainCharacters,
        recentlyChanged,
        pendingReview,
        conflictRisk,
        allCharacters: responseItems,
      },
    };
  }

  getRelationships(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const outline = this.getFocusOutline(projectId, focusChapter);
    const characters = this.allCharacters(projectId);
    const snapshots = this.allStateSnapshots(projectId);
    const relationships = this.allRelationships(projectId);
    const events = this.allRelationshipEvents(projectId);
    const focusIds = this.focusCharacterIds(characters, snapshots, relationships, focusChapter, outline);
    const responseItems = relationships.map(row => this.relationshipToResponse(row, characters, events));
    const focusRelationships = responseItems.filter(rel =>
      rel.firstChapterId === focusChapter?.id
      || rel.latestChapterId === focusChapter?.id
      || events.some(event => event.relationship_id === rel.id && event.chapter_id === focusChapter?.id)
      || (focusIds.has(rel.sourceCharacterId) && focusIds.has(rel.targetCharacterId))
    );
    const highConflict = responseItems.filter(rel => rel.conflictScore >= 70);
    const hiddenRelationships = responseItems.filter(rel => !!rel.hiddenRelation || rel.relationType === 'hidden' || rel.readerKnownState === 'hinted');
    const trustChanged = responseItems.filter(rel => String(rel.changeSummary || '').trim() || rel.trustScore < 40);
    const pendingReview = responseItems.filter(rel => rel.reviewStatus === 'pending');

    return {
      success: true,
      focusChapter: focusChapter || null,
      summary: {
        totalRelationships: responseItems.length,
        focusRelationships: focusRelationships.length,
        hiddenRelationships: hiddenRelationships.length,
        highConflictRelationships: highConflict.length,
        pendingReviewCount: pendingReview.length,
        changedRecentlyCount: trustChanged.length,
      },
      groups: {
        focusRelationships,
        highConflict,
        hiddenRelationships,
        trustChanged,
        pendingReview,
        allRelationships: responseItems,
      },
    };
  }

  createCharacterState(projectId: string, body: any) {
    if (!body?.characterId || !body?.stateType) throw new BadRequestException('characterId and stateType are required');
    const stateType = this.ensureEnum(body.stateType, STATE_TYPES, 'stateType');
    const existingLocked = this.database.prepare(`
      SELECT * FROM character_state_snapshots
      WHERE project_id = ? AND character_id = ? AND COALESCE(chapter_id, '') = COALESCE(?, '')
        AND state_type = ? AND review_status = 'confirmed' AND locked = 1
      LIMIT 1
    `).get(projectId, body.characterId, body.chapterId || null, stateType);
    if (existingLocked) throw new ConflictException('Cannot overwrite locked confirmed character state');

    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO character_state_snapshots (
        id, project_id, character_id, chapter_id, volume_index, state_type, current_state, evidence,
        cause, action_impact, relation_impact, goal_impact, foreshadowing_impact, future_change,
        conflict_risk, review_status, source, confidence, locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.characterId, body.chapterId || null, numberOrNull(body.volumeIndex), stateType,
      body.currentState || '', body.evidence || '', body.cause || '', body.actionImpact || '',
      body.relationImpact || '', body.goalImpact || '', body.foreshadowingImpact || '', body.futureChange || '',
      body.conflictRisk || '', 'pending', this.normalizeSource(body.source), numberOrDefault(body.confidence, 1),
      0, now, now,
    );
    return this.stateById(projectId, id);
  }

  updateCharacterState(projectId: string, stateId: string, body: any) {
    const existing: any = this.stateById(projectId, stateId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (existing.locked && normalizedSource === 'ai') {
      throw new ConflictException('Cannot let AI overwrite locked character state');
    }
    if (Number(existing.locked) === 1 && !body.forceUnlock) {
      throw new ConflictException('Cannot modify locked character state without forceUnlock=true');
    }
    if (existing.locked && body.forceUnlock && normalizedSource === 'ai') {
      throw new ConflictException('AI source cannot force unlock character state');
    }
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.reviewStatus;
    if (body.locked === true && nextReviewStatus !== 'confirmed') {
      throw new BadRequestException('Only confirmed character states can be locked');
    }
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      stateType: 'state_type', currentState: 'current_state', evidence: 'evidence', cause: 'cause',
      actionImpact: 'action_impact', relationImpact: 'relation_impact', goalImpact: 'goal_impact',
      foreshadowingImpact: 'foreshadowing_impact', futureChange: 'future_change', conflictRisk: 'conflict_risk',
      reviewStatus: 'review_status', source: 'source', confidence: 'confidence', locked: 'locked',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'stateType') fields[column] = this.ensureEnum(body[camel], STATE_TYPES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else fields[column] = body[camel];
    }
    this.updateRow('character_state_snapshots', projectId, stateId, fields);
    return this.stateById(projectId, stateId);
  }

  createRelationship(projectId: string, body: any) {
    if (!body?.sourceCharacterId || !body?.targetCharacterId) throw new BadRequestException('sourceCharacterId and targetCharacterId are required');
    if (body.sourceCharacterId === body.targetCharacterId) throw new BadRequestException('sourceCharacterId and targetCharacterId cannot be the same');
    const relationType = this.ensureEnum(body.relationType || 'unknown', RELATION_TYPES, 'relationType');
    this.ensureScore(body.trustScore, 'trustScore');
    this.ensureScore(body.conflictScore, 'conflictScore');
    const duplicate = this.database.prepare(`
      SELECT * FROM character_relationships
      WHERE project_id = ? AND source_character_id = ? AND target_character_id = ? AND relation_type = ?
      LIMIT 1
    `).get(projectId, body.sourceCharacterId, body.targetCharacterId, relationType);
    if (duplicate) throw new ConflictException('Relationship already exists; update the existing relationship instead');

    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO character_relationships (
        id, project_id, source_character_id, target_character_id, relation_type, public_relation,
        hidden_relation, trust_score, conflict_score, emotional_tendency, interest_binding,
        first_chapter_id, latest_chapter_id, current_phase, reader_known_state, source_known_state,
        target_known_state, change_summary, change_history_json, related_foreshadowing_ids,
        related_timeline_event_ids, review_status, locked, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.sourceCharacterId, body.targetCharacterId, relationType, body.publicRelation || '',
      body.hiddenRelation || '', numberOrDefault(body.trustScore, 50), numberOrDefault(body.conflictScore, 0),
      body.emotionalTendency || '', body.interestBinding || '', body.firstChapterId || null, body.latestChapterId || null,
      body.currentPhase || '', this.ensureEnum(body.readerKnownState || 'unknown', READER_STATES, 'readerKnownState'),
      this.ensureEnum(body.sourceKnownState || 'unknown', CHARACTER_KNOWN_STATES, 'sourceKnownState'),
      this.ensureEnum(body.targetKnownState || 'unknown', CHARACTER_KNOWN_STATES, 'targetKnownState'),
      body.changeSummary || '', JSON.stringify(body.changeHistory || []), JSON.stringify(body.relatedForeshadowingIds || []),
      JSON.stringify(body.relatedTimelineEventIds || []), 'pending',
      0, this.normalizeSource(body.source), numberOrDefault(body.confidence, 1), now, now,
    );
    return this.relationshipById(projectId, id);
  }

  updateRelationship(projectId: string, relationshipId: string, body: any) {
    const existing: any = this.relationshipRawById(projectId, relationshipId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked relationship');
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') {
      throw new BadRequestException('Only confirmed relationships can be locked');
    }
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      publicRelation: 'public_relation', hiddenRelation: 'hidden_relation', trustScore: 'trust_score',
      conflictScore: 'conflict_score', emotionalTendency: 'emotional_tendency', interestBinding: 'interest_binding',
      firstChapterId: 'first_chapter_id', latestChapterId: 'latest_chapter_id', currentPhase: 'current_phase',
      readerKnownState: 'reader_known_state', sourceKnownState: 'source_known_state', targetKnownState: 'target_known_state',
      changeSummary: 'change_summary', reviewStatus: 'review_status', locked: 'locked', source: 'source',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'trustScore' || camel === 'conflictScore') {
        this.ensureScore(body[camel], camel);
        fields[column] = Number(body[camel]);
      } else if (camel === 'readerKnownState') fields[column] = this.ensureEnum(body[camel], READER_STATES, camel);
      else if (camel === 'sourceKnownState' || camel === 'targetKnownState') fields[column] = this.ensureEnum(body[camel], CHARACTER_KNOWN_STATES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else fields[column] = body[camel];
    }
    this.updateRow('character_relationships', projectId, relationshipId, fields);
    return this.relationshipById(projectId, relationshipId);
  }

  createRelationshipEvent(projectId: string, relationshipId: string, body: any) {
    const relationship: any = this.relationshipRawById(projectId, relationshipId);
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO character_relationship_events (
        id, project_id, relationship_id, chapter_id, event_type, summary, before_state_json,
        after_state_json, evidence, impact, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, relationshipId, body.chapterId || null,
      this.ensureEnum(body.eventType || 'other', RELATION_EVENT_TYPES, 'eventType'),
      body.summary || '', JSON.stringify(body.beforeState || {}), JSON.stringify(body.afterState || {}),
      body.evidence || '', body.impact || '', 'pending',
      now, now,
    );
    if (Number(relationship.locked) !== 1) {
      this.database.prepare(`
        UPDATE character_relationships
        SET latest_chapter_id = COALESCE(?, latest_chapter_id), change_summary = COALESCE(NULLIF(?, ''), change_summary), updated_at = ?
        WHERE project_id = ? AND id = ?
      `).run(body.chapterId || null, body.summary || '', now, projectId, relationshipId);
    }
    return this.database.prepare('SELECT * FROM character_relationship_events WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  private allCharacters(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY is_pov_character DESC, updated_at DESC').all(projectId) as any[];
  }

  private allStateSnapshots(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM character_state_snapshots WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allRelationships(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM character_relationships WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allRelationshipEvents(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM character_relationship_events WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private getChapter(projectId: string, chapterId?: string): any | null {
    if (chapterId) {
      return this.database.prepare('SELECT * FROM chapters WHERE project_id = ? AND id = ?').get(projectId, chapterId) || null;
    }
    return null;
  }

  private getFocusOutline(projectId: string, chapter: any | null): any | null {
    if (!chapter) return null;
    if (chapter.outline_id) {
      const byId = this.database.prepare('SELECT * FROM outlines WHERE project_id = ? AND id = ?').get(projectId, chapter.outline_id);
      if (byId) return byId;
    }
    return this.database.prepare(`
      SELECT * FROM outlines WHERE project_id = ? AND level = 'chapter'
      ORDER BY ABS(COALESCE("order", 0) + 1 - ?) ASC LIMIT 1
    `).get(projectId, Number(chapter.chapter_index || 1)) || null;
  }

  private focusCharacterIds(characters: any[], snapshots: any[], relationships: any[], chapter: any | null, outline: any | null): Set<string> {
    const ids = new Set<string>();
    if (!chapter) return ids;
    const text = `${chapter.title || ''}\n${chapter.content || ''}\n${outline?.content || ''}`;
    for (const character of characters) {
      if (character.name && text.includes(character.name)) ids.add(character.id);
    }
    for (const snapshot of snapshots) {
      if (snapshot.chapter_id === chapter.id) ids.add(snapshot.character_id);
    }
    for (const rel of relationships) {
      if (rel.first_chapter_id === chapter.id || rel.latest_chapter_id === chapter.id) {
        ids.add(rel.source_character_id);
        ids.add(rel.target_character_id);
      }
    }
    return ids;
  }

  private characterToResponse(character: any, snapshots: any[], relationships: any[], focusChapter: any | null) {
    const charSnapshots = snapshots.filter(s => s.character_id === character.id);
    const latestSnapshots = charSnapshots.slice(0, 8).map(s => this.stateToResponse(s));
    const goalState = charSnapshots.find(s => s.state_type === 'goal');
    const statusState = charSnapshots.find(s => s.current_state);
    const charRelationships = relationships.filter(r => r.source_character_id === character.id || r.target_character_id === character.id);
    const riskTags = [
      ...charSnapshots.filter(s => s.review_status === 'conflict' || s.conflict_risk).map(s => s.state_type),
      ...charRelationships.filter(r => Number(r.conflict_score || 0) >= 70).map(() => 'relationship_conflict'),
    ];
    return {
      id: character.id,
      name: character.name,
      identity: character.identity || '待补全',
      personality: parseJson(character.personality, {}),
      dialogueStyle: character.dialogue_style || '待补全',
      isPovCharacter: Number(character.is_pov_character) === 1,
      role: character.role || 'supporting',
      currentGoal: goalState?.current_state || '待补全',
      currentStateSummary: statusState?.current_state || '待补全',
      latestStateSnapshots: latestSnapshots,
      relationshipSummary: charRelationships.length ? `${charRelationships.length} 条关系` : '待补全',
      riskTags: Array.from(new Set(riskTags)).slice(0, 8),
      pendingReviewCount: charSnapshots.filter(s => s.review_status === 'pending').length,
      sourceChapterId: charSnapshots[0]?.chapter_id || focusChapter?.id || null,
      updatedAt: charSnapshots[0]?.updated_at || character.updated_at,
    };
  }

  private relationshipToResponse(row: any, characters: any[], events: any[]) {
    const source = characters.find(c => c.id === row.source_character_id);
    const target = characters.find(c => c.id === row.target_character_id);
    return {
      id: row.id,
      sourceCharacterId: row.source_character_id,
      sourceCharacterName: source?.name || '待补全',
      targetCharacterId: row.target_character_id,
      targetCharacterName: target?.name || '待补全',
      relationType: row.relation_type,
      publicRelation: row.public_relation || '待补全',
      hiddenRelation: row.hidden_relation || '',
      trustScore: Number(row.trust_score ?? 50),
      conflictScore: Number(row.conflict_score ?? 0),
      emotionalTendency: row.emotional_tendency || '待补全',
      interestBinding: row.interest_binding || '待补全',
      firstChapterId: row.first_chapter_id || null,
      latestChapterId: row.latest_chapter_id || null,
      currentPhase: row.current_phase || '待补全',
      readerKnownState: row.reader_known_state || 'unknown',
      sourceKnownState: row.source_known_state || 'unknown',
      targetKnownState: row.target_known_state || 'unknown',
      changeSummary: row.change_summary || '',
      relatedForeshadowingIds: parseJson(row.related_foreshadowing_ids, []),
      relatedTimelineEventIds: parseJson(row.related_timeline_event_ids, []),
      reviewStatus: row.review_status,
      locked: Number(row.locked) === 1,
      source: row.source || 'manual',
      updatedAt: row.updated_at,
      events: events.filter(event => event.relationship_id === row.id),
    };
  }

  private stateToResponse(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      characterId: row.character_id,
      chapterId: row.chapter_id,
      volumeIndex: row.volume_index,
      stateType: row.state_type,
      currentState: row.current_state || '',
      evidence: row.evidence || '',
      cause: row.cause || '',
      actionImpact: row.action_impact || '',
      relationImpact: row.relation_impact || '',
      goalImpact: row.goal_impact || '',
      foreshadowingImpact: row.foreshadowing_impact || '',
      futureChange: row.future_change || '',
      conflictRisk: row.conflict_risk || '',
      reviewStatus: row.review_status,
      source: row.source,
      confidence: Number(row.confidence ?? 1),
      locked: Number(row.locked) === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private stateById(projectId: string, stateId: string) {
    const row = this.database.prepare('SELECT * FROM character_state_snapshots WHERE project_id = ? AND id = ?').get(projectId, stateId);
    if (!row) throw new NotFoundException(`Character state ${stateId} not found`);
    return this.stateToResponse(row);
  }

  private relationshipRawById(projectId: string, relationshipId: string) {
    const row = this.database.prepare('SELECT * FROM character_relationships WHERE project_id = ? AND id = ?').get(projectId, relationshipId);
    if (!row) throw new NotFoundException(`Relationship ${relationshipId} not found`);
    return row;
  }

  private relationshipById(projectId: string, relationshipId: string) {
    return this.relationshipToResponse(this.relationshipRawById(projectId, relationshipId), this.allCharacters(projectId), this.allRelationshipEvents(projectId));
  }

  private updateRow(table: string, projectId: string, id: string, fields: Record<string, unknown>) {
    const entries = Object.entries(fields);
    if (!entries.length) return;
    entries.push(['updated_at', new Date().toISOString()]);
    const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
    this.database.prepare(`UPDATE ${table} SET ${setSql} WHERE project_id = ? AND id = ?`).run(...entries.map(([, value]) => value), projectId, id);
  }

  private ensureEnum(value: string, allowed: Set<string>, field: string): string {
    if (!allowed.has(value)) throw new BadRequestException(`${field} must be one of: ${Array.from(allowed).join(', ')}`);
    return value;
  }

  private ensureScore(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) throw new BadRequestException(`${field} must be between 0 and 100`);
  }

  private normalizeSource(value: unknown): string {
    const source = String(value || 'manual');
    return SOURCES.has(source) ? source : 'manual';
  }
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJson(raw: string, fallback: any) {
  try { return JSON.parse(raw || ''); } catch { return fallback; }
}
