import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';

const STATE_TYPES = new Set(['physical', 'emotion', 'goal', 'identity', 'relationship', 'resource', 'secret', 'ability', 'restriction', 'reputation', 'location', 'arc']);
const REVIEW_STATUSES = new Set(['draft', 'pending', 'confirmed', 'ignored', 'conflict', 'archived']);
const RELATION_TYPES = new Set(['ally', 'enemy', 'family', 'mentor', 'disciple', 'superior', 'subordinate', 'rival', 'lover_like', 'debt', 'benefit', 'hidden', 'unknown', 'other']);
const READER_STATES = new Set(['unknown', 'hinted', 'known', 'misdirected']);
const CHARACTER_KNOWN_STATES = new Set(['unknown', 'partial', 'known', 'misunderstood']);
const RELATION_EVENT_TYPES = new Set(['established', 'deepened', 'conflicted', 'betrayed', 'reconciled', 'revealed', 'hidden', 'weakened', 'strengthened', 'other']);
const FORESHADOWING_LEVELS = new Set(['full_book', 'volume', 'chapter']);
const FORESHADOWING_STATUSES = new Set(['planned', 'buried', 'deepened', 'misdirected', 'recovery_due', 'recovered', 'overdue', 'conflict', 'abandoned']);
const FORESHADOWING_RISK_LEVELS = new Set(['none', 'low', 'medium', 'high', 'critical']);
const FORESHADOWING_EVENT_TYPES = new Set(['planned', 'buried', 'deepened', 'misdirected', 'hinted', 'recovered', 'delayed', 'cancelled', 'conflict', 'other']);
const FORESHADOWING_TASK_TYPES = new Set(['bury', 'deepen', 'misdirect', 'recover', 'delay', 'check', 'avoid_contradiction']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const TASK_STATUSES = new Set(['todo', 'doing', 'done', 'skipped', 'overdue', 'conflict']);
const SOURCES = new Set(['manual', 'ai', 'chapter_extract', 'legacy_import']);
const WORLD_RULE_TYPES = new Set(['geography', 'era', 'society', 'law', 'profession', 'organization', 'technology', 'power_system', 'resource', 'culture', 'economy', 'family', 'custom']);
const WORLD_RULE_SCOPES = new Set(['full_book', 'volume', 'chapter', 'location', 'organization', 'character', 'relationship']);
const WORLD_RULE_STATUSES = new Set(['planned', 'established', 'active', 'changed', 'violated', 'conflict', 'deprecated']);
const WORLD_RULE_RISK_LEVELS = new Set(['none', 'low', 'medium', 'high', 'critical']);
const WORLD_RULE_EVENT_TYPES = new Set(['established', 'used', 'verified', 'changed', 'violated', 'revealed', 'conflict', 'deprecated', 'other']);
const WORLD_RULE_TASK_TYPES = new Set(['apply', 'check', 'reveal', 'avoid_contradiction', 'update_rule', 'verify']);
const TIMELINE_LINE_TYPES = new Set(['story_time', 'narrative_order', 'causality']);
const TIMELINE_LINK_TYPES = new Set(['cause', 'effect', 'condition', 'motivation', 'information', 'misdirection', 'contradiction', 'parallel', 'other']);
const TIMELINE_EVENT_STATUSES = new Set(['planned', 'happened', 'revealed', 'hidden', 'changed', 'conflict', 'deprecated']);
const TIMELINE_TASK_TYPES = new Set(['place_event', 'check_order', 'check_causality', 'reveal_information', 'avoid_time_conflict', 'sync_lines']);

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
    const recentlyChanged = responseItems.filter(item => item.sourceChapterId);
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

  getForeshadowings(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const threads = this.allForeshadowingThreads(projectId);
    const events = this.allForeshadowingEvents(projectId);
    const tasks = this.allForeshadowingTasks(projectId);
    const legacy = this.allLegacyForeshadowings(projectId);
    const currentChapterIndex = focusChapter ? Number(focusChapter.chapter_index || focusChapter.chapterIndex || 0) : 0;
    const orderMap = this.getChapterOrderMap(projectId);

    // Get focus character and relationship IDs for the current chapter
    const characters = this.allCharacters(projectId);
    const snapshots = this.allStateSnapshots(projectId);
    const relationships = this.allRelationships(projectId);
    const outline = focusChapter ? this.getFocusOutline(projectId, focusChapter) : null;
    const focusCharacterIds = this.focusCharacterIds(characters, snapshots, relationships, focusChapter, outline);

    // Focus relationship IDs for current chapter
    const relEvents = this.allRelationshipEvents(projectId);
    const focusRelationshipIds = new Set<string>();
    if (focusChapter) {
      for (const rel of relationships) {
        if (rel.first_chapter_id === focusChapter.id || rel.latest_chapter_id === focusChapter.id) {
          focusRelationshipIds.add(rel.id);
        }
        if (focusCharacterIds.has(rel.source_character_id) && focusCharacterIds.has(rel.target_character_id)) {
          focusRelationshipIds.add(rel.id);
        }
      }
      for (const rEvent of relEvents) {
        if (rEvent.chapter_id === focusChapter.id) {
          focusRelationshipIds.add(rEvent.relationship_id);
        }
      }
    }

    const responseThreads = threads.map(thread => this.foreshadowingToResponse(thread, events, tasks, focusChapter));
    const legacyThreads = legacy.map(item => this.legacyForeshadowingToResponse(item, currentChapterIndex, focusChapter));
    const allThreads = [...responseThreads, ...legacyThreads];

    // Persisted focus tasks (from foreshadowing_chapter_tasks + legacy)
    const persistedFocusTasks = [
      ...tasks.filter(task => task.chapter_id === focusChapter?.id).map(task => this.taskToResponse(task, responseThreads.find(t => t.id === task.thread_id))),
      ...legacyThreads.flatMap(thread => thread.focusTasks || []),
    ];

    // Build derived tasks for each new-format thread
    const derivedTasks: any[] = [];
    for (const thread of responseThreads) {
      const threadDerived = this.buildDerivedForeshadowingTasks(thread, focusChapter, orderMap, events, focusCharacterIds, focusRelationshipIds);
      derivedTasks.push(...threadDerived);
    }

    // Dedup: if a persisted task has the same (threadId, taskType, reason), prefer persisted
    const persistedKeySet = new Set(persistedFocusTasks.map(t => `${t.threadId}-${t.taskType}-${t.reason}`));
    const uniqueDerived = derivedTasks.filter(t => !persistedKeySet.has(`${t.threadId}-${t.taskType}-${t.reason}`));

    // Dedup derived tasks among themselves
    const derivedKeySet = new Set<string>();
    const dedupedDerived: any[] = [];
    for (const t of uniqueDerived) {
      const key = `${t.threadId}-${t.taskType}-${t.reason}`;
      if (!derivedKeySet.has(key)) {
        derivedKeySet.add(key);
        dedupedDerived.push(t);
      }
    }

    const focusTasks = [...persistedFocusTasks, ...dedupedDerived];

    // Focus threads: all threads that have any focus task (persisted or derived)
    const focusThreadIds = new Set<string>();
    for (const task of focusTasks) {
      focusThreadIds.add(task.threadId);
    }
    const focusThreads = allThreads.filter(t => focusThreadIds.has(t.id));

    const recoveryDue = allThreads.filter(thread => this.isRecoveryDue(thread, focusChapter, currentChapterIndex, orderMap));
    const overdue = allThreads.filter(thread => this.isOverdue(thread, focusChapter, currentChapterIndex, orderMap));
    const highRisk = allThreads.filter(thread => ['high', 'critical'].includes(thread.riskLevel) || thread.status === 'conflict');
    const pendingReview = allThreads.filter(thread => thread.reviewStatus === 'pending')
      .concat(responseThreads.filter(thread => (thread.latestEvents || []).some((event: any) => event.reviewStatus === 'pending')));

    return {
      success: true,
      focusChapter: focusChapter || null,
      summary: {
        totalThreads: allThreads.length,
        focusTasks: focusTasks.length,
        focusThreads: focusThreads.length,
        fullBookThreads: allThreads.filter(t => t.level === 'full_book').length,
        volumeThreads: allThreads.filter(t => t.level === 'volume').length,
        chapterThreads: allThreads.filter(t => t.level === 'chapter').length,
        pendingReviewCount: pendingReview.length + tasks.filter(task => task.review_status === 'pending').length,
        overdueCount: overdue.length,
        recoveryDueCount: recoveryDue.length,
        highRiskCount: highRisk.length,
        lockedCount: allThreads.filter(t => t.locked).length,
      },
      groups: {
        focusTasks,
        focusThreads,
        recoveryDue,
        overdue,
        highRisk,
        pendingReview,
        fullBookThreads: allThreads.filter(t => t.level === 'full_book'),
        volumeThreads: allThreads.filter(t => t.level === 'volume'),
        chapterThreads: allThreads.filter(t => t.level === 'chapter'),
        recovered: allThreads.filter(t => t.status === 'recovered'),
        allThreads,
      },
    };
  }

  createForeshadowingThread(projectId: string, body: any) {
    if (!String(body?.title || '').trim()) throw new BadRequestException('title is required');
    const level = this.ensureEnum(body.level || 'chapter', FORESHADOWING_LEVELS, 'level');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO foreshadowing_threads (
        id, project_id, legacy_foreshadowing_id, title, level, volume_index, status, summary,
        reader_understanding, true_meaning, reveal_strategy, risk_level, risk_reason,
        planned_bury_chapter_id, actual_bury_chapter_id, planned_deepen_chapter_ids,
        planned_misdirect_chapter_ids, recovery_window_start_chapter_id, recovery_window_end_chapter_id,
        actual_recovery_chapter_id, related_character_ids, related_relationship_ids,
        related_timeline_event_ids, related_world_rule_ids, review_status, locked, source,
        confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.legacyForeshadowingId || null, String(body.title).trim(), level,
      numberOrNull(body.volumeIndex), 'planned', body.summary || '', body.readerUnderstanding || '',
      body.trueMeaning || '', body.revealStrategy || '', this.ensureEnum(body.riskLevel || 'none', FORESHADOWING_RISK_LEVELS, 'riskLevel'),
      body.riskReason || '', body.plannedBuryChapterId || null, body.actualBuryChapterId || null,
      JSON.stringify(body.plannedDeepenChapterIds || []), JSON.stringify(body.plannedMisdirectChapterIds || []),
      body.recoveryWindowStartChapterId || null, body.recoveryWindowEndChapterId || null,
      body.actualRecoveryChapterId || null, JSON.stringify(body.relatedCharacterIds || []),
      JSON.stringify(body.relatedRelationshipIds || []), JSON.stringify(body.relatedTimelineEventIds || []),
      JSON.stringify(body.relatedWorldRuleIds || []), 'pending', 0, this.normalizeSource(body.source),
      numberOrDefault(body.confidence, 1), now, now,
    );
    return this.foreshadowingById(projectId, id);
  }

  updateForeshadowingThread(projectId: string, threadId: string, body: any) {
    const existing: any = this.foreshadowingRawById(projectId, threadId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked foreshadowing');
    const coreFields = ['title', 'summary', 'readerUnderstanding', 'trueMeaning', 'revealStrategy', 'riskLevel', 'riskReason', 'status', 'plannedBuryChapterId', 'actualBuryChapterId', 'recoveryWindowStartChapterId', 'recoveryWindowEndChapterId', 'actualRecoveryChapterId'];
    if (Number(existing.locked) === 1 && !body.forceUnlock && coreFields.some(field => body[field] !== undefined)) {
      throw new ConflictException('Cannot modify locked foreshadowing core fields without forceUnlock=true');
    }
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed foreshadowings can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      title: 'title', level: 'level', volumeIndex: 'volume_index', status: 'status', summary: 'summary',
      readerUnderstanding: 'reader_understanding', trueMeaning: 'true_meaning', revealStrategy: 'reveal_strategy',
      riskLevel: 'risk_level', riskReason: 'risk_reason', plannedBuryChapterId: 'planned_bury_chapter_id',
      actualBuryChapterId: 'actual_bury_chapter_id', recoveryWindowStartChapterId: 'recovery_window_start_chapter_id',
      recoveryWindowEndChapterId: 'recovery_window_end_chapter_id', actualRecoveryChapterId: 'actual_recovery_chapter_id',
      reviewStatus: 'review_status', locked: 'locked', source: 'source',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'level') fields[column] = this.ensureEnum(body[camel], FORESHADOWING_LEVELS, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], FORESHADOWING_STATUSES, camel);
      else if (camel === 'riskLevel') fields[column] = this.ensureEnum(body[camel], FORESHADOWING_RISK_LEVELS, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else fields[column] = body[camel];
    }
    if (body.relatedCharacterIds !== undefined) fields.related_character_ids = JSON.stringify(body.relatedCharacterIds || []);
    if (body.relatedRelationshipIds !== undefined) fields.related_relationship_ids = JSON.stringify(body.relatedRelationshipIds || []);
    if (body.relatedTimelineEventIds !== undefined) fields.related_timeline_event_ids = JSON.stringify(body.relatedTimelineEventIds || []);
    if (body.plannedDeepenChapterIds !== undefined) fields.planned_deepen_chapter_ids = JSON.stringify(body.plannedDeepenChapterIds || []);
    if (body.plannedMisdirectChapterIds !== undefined) fields.planned_misdirect_chapter_ids = JSON.stringify(body.plannedMisdirectChapterIds || []);
    this.updateRow('foreshadowing_threads', projectId, threadId, fields);
    return this.foreshadowingById(projectId, threadId);
  }

  createForeshadowingEvent(projectId: string, threadId: string, body: any) {
    const thread: any = this.foreshadowingRawById(projectId, threadId);
    const source = this.normalizeSource(body.source);
    if (Number(thread.locked) === 1 && source === 'ai') throw new ConflictException('Cannot let AI add event to locked foreshadowing');
    const now = new Date().toISOString();
    const eventType = this.ensureEnum(body.eventType || 'other', FORESHADOWING_EVENT_TYPES, 'eventType');
    const id = uuid();
    this.database.prepare(`
      INSERT INTO foreshadowing_lifecycle_events (
        id, project_id, thread_id, chapter_id, event_type, summary, reader_effect, true_effect,
        evidence, impact, before_state_json, after_state_json, review_status, source, confidence,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, threadId, body.chapterId || null, eventType, body.summary || '',
      body.readerEffect || '', body.trueEffect || '', body.evidence || '', body.impact || '',
      JSON.stringify(body.beforeState || {}), JSON.stringify(body.afterState || {}), 'pending',
      source, numberOrDefault(body.confidence, 1), now, now,
    );
    if (Number(thread.locked) !== 1) {
      const fields: Record<string, unknown> = {};
      if (eventType === 'buried') fields.actual_bury_chapter_id = body.chapterId || thread.actual_bury_chapter_id;
      if (eventType === 'recovered') {
        fields.actual_recovery_chapter_id = body.chapterId || thread.actual_recovery_chapter_id;
        fields.status = 'recovered';
      }
      if (eventType === 'deepened') fields.status = 'deepened';
      if (eventType === 'misdirected') fields.status = 'misdirected';
      if (eventType === 'conflict') fields.status = 'conflict';
      this.updateRow('foreshadowing_threads', projectId, threadId, fields);
    }
    return this.database.prepare('SELECT * FROM foreshadowing_lifecycle_events WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  createForeshadowingTask(projectId: string, body: any) {
    if (!body?.threadId || !body?.chapterId) throw new BadRequestException('threadId and chapterId are required');
    this.foreshadowingRawById(projectId, body.threadId);
    const chapter = this.getChapter(projectId, body.chapterId);
    if (!chapter) throw new BadRequestException('chapterId must reference an existing chapter');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO foreshadowing_chapter_tasks (
        id, project_id, thread_id, chapter_id, task_type, priority, instruction, reason,
        status, review_status, source, locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.threadId, body.chapterId,
      this.ensureEnum(body.taskType || 'check', FORESHADOWING_TASK_TYPES, 'taskType'),
      this.ensureEnum(body.priority || 'medium', TASK_PRIORITIES, 'priority'),
      body.instruction || '', body.reason || '', 'todo', 'pending', this.normalizeSource(body.source), 0, now, now,
    );
    return this.database.prepare('SELECT * FROM foreshadowing_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  updateForeshadowingTask(projectId: string, taskId: string, body: any) {
    const existing: any = this.foreshadowingTaskRawById(projectId, taskId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked foreshadowing task');
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed foreshadowing tasks can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      taskType: 'task_type', priority: 'priority', instruction: 'instruction', reason: 'reason',
      status: 'status', reviewStatus: 'review_status', source: 'source', locked: 'locked',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'taskType') fields[column] = this.ensureEnum(body[camel], FORESHADOWING_TASK_TYPES, camel);
      else if (camel === 'priority') fields[column] = this.ensureEnum(body[camel], TASK_PRIORITIES, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], TASK_STATUSES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else fields[column] = body[camel];
    }
    this.updateRow('foreshadowing_chapter_tasks', projectId, taskId, fields);
    return this.database.prepare('SELECT * FROM foreshadowing_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
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


  // ===== Phase 7.4: World Rules =====

  getWorldRules(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const rules = this.allWorldRules(projectId);
    const events = this.allWorldRuleEvents(projectId);
    const tasks = this.allWorldRuleTasks(projectId);
    const characters = this.allCharacters(projectId);
    const snapshots = this.allStateSnapshots(projectId);
    const relationships = this.allRelationships(projectId);
    const outline = focusChapter ? this.getFocusOutline(projectId, focusChapter) : null;
    const focusCharacterIds = this.focusCharacterIds(characters, snapshots, relationships, focusChapter, outline);
    const focusRelationshipIds = this.getFocusRelationshipIds(projectId, focusChapter, relationships, focusCharacterIds);
    const focusForeshadowingIds = this.getFocusForeshadowingIds(projectId, focusChapter, focusCharacterIds, focusRelationshipIds);
    const focusTimelineEventIds = this.getFocusTimelineEventIds(projectId, focusChapter, focusCharacterIds, focusRelationshipIds);
    const orderMap = this.getChapterOrderMap(projectId);
    const currentVolumeIndex = focusChapter ? Number(focusChapter.volume_index || focusChapter.volumeIndex || 0) : 0;

    const responseRules = rules.map(rule => this.worldRuleToResponse(rule, events, tasks, focusChapter));

    // Persisted focus tasks (compute before focusRules since focusRules references focusTasks)
    const persistedFocusTasks = tasks.filter(t => t.chapter_id === focusChapter?.id).map(t => this.worldRuleTaskToResponse(t));
    const derivedTasks = this.buildDerivedWorldRuleTasks(responseRules, focusChapter, focusCharacterIds, focusRelationshipIds, focusForeshadowingIds, focusTimelineEventIds);
    const persistedKeySet = new Set(persistedFocusTasks.map((t: any) => `${t.ruleId}-${t.taskType}-${t.reason}`));
    const uniqueDerived = derivedTasks.filter((t: any) => !persistedKeySet.has(`${t.ruleId}-${t.taskType}-${t.reason}`));
    const dedupedDerived: any[] = [];
    const derivedKeySet = new Set<string>();
    for (const t of uniqueDerived) {
      const key = `${t.ruleId}-${t.taskType}-${t.reason}`;
      if (!derivedKeySet.has(key)) { derivedKeySet.add(key); dedupedDerived.push(t); }
    }
    const focusTasks = [...persistedFocusTasks, ...dedupedDerived];

    const focusRules = responseRules.filter(rule =>
      tasks.some(t => t.rule_id === rule.id && t.chapter_id === focusChapter?.id)
      || events.some(e => e.rule_id === rule.id && e.chapter_id === focusChapter?.id)
      || rule.firstEstablishedChapterId === focusChapter?.id
      || rule.lastVerifiedChapterId === focusChapter?.id
      || (rule.scope === 'chapter' && rule.relatedCharacterIds?.some((c: string) => focusCharacterIds.has(c)))
      || (rule.scope === 'volume' && rule.volumeIndex === currentVolumeIndex)
      || rule.relatedCharacterIds?.some((c: string) => focusCharacterIds.has(c))
      || rule.relatedRelationshipIds?.some((r: string) => focusRelationshipIds.has(r))
      || (rule.relatedForeshadowingIds || []).some((f: string) => focusForeshadowingIds.has(f))
      || (rule.relatedTimelineEventIds || []).some((t: string) => focusTimelineEventIds.has(t))
      || focusTasks.some((ft: any) => ft.ruleId === rule.id)
    );

    return {
      success: true,
      focusChapter: focusChapter || null,
      summary: {
        totalRules: responseRules.length,
        focusRules: focusRules.length,
        focusTasks: focusTasks.length,
        fullBookRules: responseRules.filter(r => r.scope === 'full_book').length,
        volumeRules: responseRules.filter(r => r.scope === 'volume').length,
        chapterRules: responseRules.filter(r => r.scope === 'chapter').length,
        pendingReviewCount: responseRules.filter(r => r.reviewStatus === 'pending').length
        + tasks.filter(t => t.review_status === 'pending').length
        + events.filter(e => e.review_status === 'pending').length,
        conflictCount: responseRules.filter(r => r.status === 'conflict' || r.contradictionRisk).length,
        highRiskCount: responseRules.filter(r => ['high', 'critical'].includes(r.riskLevel)).length,
        lockedCount: responseRules.filter(r => r.locked).length,
        changedRecentlyCount: responseRules.filter(r => r.status === 'changed' || r.status === 'violated').length,
      },
      groups: {
        focusTasks,
        focusRules,
        activeRules: responseRules.filter(r => r.status === 'established' || r.status === 'active'),
        conflictRules: responseRules.filter(r => r.status === 'conflict' || r.contradictionRisk),
        highRisk: responseRules.filter(r => ['high', 'critical'].includes(r.riskLevel)),
        pendingReview: responseRules.filter(r => r.reviewStatus === 'pending'),
        fullBookRules: responseRules.filter(r => r.scope === 'full_book'),
        volumeRules: responseRules.filter(r => r.scope === 'volume'),
        chapterRules: responseRules.filter(r => r.scope === 'chapter'),
        changedRecently: responseRules.filter(r => r.status === 'changed' || r.status === 'violated'),
        allRules: responseRules,
      },
    };
  }

  createWorldRule(projectId: string, body: any) {
    if (!String(body?.title || '').trim()) throw new BadRequestException('title is required');
    const ruleType = this.ensureEnum(body.ruleType || 'law', WORLD_RULE_TYPES, 'ruleType');
    const scope = this.ensureEnum(body.scope || 'full_book', WORLD_RULE_SCOPES, 'scope');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO world_rules (
        id, project_id, title, rule_type, scope, volume_index, content, explanation, limitation,
        contradiction_risk, status, risk_level, first_established_chapter_id, last_verified_chapter_id,
        related_character_ids, related_relationship_ids, related_foreshadowing_ids, related_timeline_event_ids,
        review_status, locked, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, String(body.title).trim(), ruleType, scope, numberOrNull(body.volumeIndex),
      body.content || '', body.explanation || '', body.limitation || '', body.contradictionRisk || '',
      'planned', this.ensureEnum(body.riskLevel || 'none', WORLD_RULE_RISK_LEVELS, 'riskLevel'),
      body.firstEstablishedChapterId || null, body.lastVerifiedChapterId || null,
      JSON.stringify(body.relatedCharacterIds || []), JSON.stringify(body.relatedRelationshipIds || []),
      JSON.stringify(body.relatedForeshadowingIds || []), JSON.stringify(body.relatedTimelineEventIds || []),
      'pending', 0, this.normalizeSource(body.source), numberOrDefault(body.confidence, 1), now, now,
    );
    return this.worldRuleById(projectId, id);
  }

  updateWorldRule(projectId: string, ruleId: string, body: any) {
    const existing: any = this.worldRuleRawById(projectId, ruleId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked world rule');
    const coreFields = ['title', 'content', 'explanation', 'limitation', 'contradictionRisk', 'status'];
    if (Number(existing.locked) === 1 && !body.forceUnlock && coreFields.some(f => body[f] !== undefined)) {
      throw new ConflictException('Cannot modify locked world rule without forceUnlock=true');
    }
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed world rules can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      title: 'title', ruleType: 'rule_type', scope: 'scope', volumeIndex: 'volume_index',
      content: 'content', explanation: 'explanation', limitation: 'limitation',
      contradictionRisk: 'contradiction_risk', status: 'status', riskLevel: 'risk_level',
      firstEstablishedChapterId: 'first_established_chapter_id', lastVerifiedChapterId: 'last_verified_chapter_id',
      reviewStatus: 'review_status', locked: 'locked', source: 'source',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'ruleType') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_TYPES, camel);
      else if (camel === 'scope') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_SCOPES, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_STATUSES, camel);
      else if (camel === 'riskLevel') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_RISK_LEVELS, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else fields[column] = body[camel];
    }
    if (body.relatedCharacterIds !== undefined) fields.related_character_ids = JSON.stringify(body.relatedCharacterIds || []);
    if (body.relatedRelationshipIds !== undefined) fields.related_relationship_ids = JSON.stringify(body.relatedRelationshipIds || []);
    if (body.relatedForeshadowingIds !== undefined) fields.related_foreshadowing_ids = JSON.stringify(body.relatedForeshadowingIds || []);
    if (body.relatedTimelineEventIds !== undefined) fields.related_timeline_event_ids = JSON.stringify(body.relatedTimelineEventIds || []);
    this.updateRow('world_rules', projectId, ruleId, fields);
    return this.worldRuleById(projectId, ruleId);
  }

  createWorldRuleEvent(projectId: string, ruleId: string, body: any) {
    this.worldRuleRawById(projectId, ruleId);
    const source = this.normalizeSource(body.source);
    const now = new Date().toISOString();
    const id = uuid();
    const eventType = this.ensureEnum(body.eventType || 'other', WORLD_RULE_EVENT_TYPES, 'eventType');
    this.database.prepare(`
      INSERT INTO world_rule_events (
        id, project_id, rule_id, chapter_id, event_type, summary, evidence, impact,
        before_state_json, after_state_json, review_status, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, ruleId, body.chapterId || null, eventType, body.summary || '',
      body.evidence || '', body.impact || '', JSON.stringify(body.beforeState || {}),
      JSON.stringify(body.afterState || {}), 'pending', source, numberOrDefault(body.confidence, 1), now, now,
    );
    if (body.chapterId) {
      this.database.prepare('UPDATE world_rules SET last_verified_chapter_id = COALESCE(?, last_verified_chapter_id) WHERE project_id = ? AND id = ? AND locked = 0')
        .run(body.chapterId, projectId, ruleId);
    }
    return this.database.prepare('SELECT * FROM world_rule_events WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  createWorldRuleTask(projectId: string, body: any) {
    if (!body?.ruleId || !body?.chapterId) throw new BadRequestException('ruleId and chapterId are required');
    this.worldRuleRawById(projectId, body.ruleId);
    const chapter = this.getChapter(projectId, body.chapterId);
    if (!chapter) throw new BadRequestException('chapterId must reference an existing chapter');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO world_rule_chapter_tasks (
        id, project_id, rule_id, chapter_id, task_type, priority, instruction, reason,
        status, review_status, source, locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.ruleId, body.chapterId,
      this.ensureEnum(body.taskType || 'check', WORLD_RULE_TASK_TYPES, 'taskType'),
      this.ensureEnum(body.priority || 'medium', TASK_PRIORITIES, 'priority'),
      body.instruction || '', body.reason || '', 'todo', 'pending', this.normalizeSource(body.source), 0, now, now,
    );
    return this.database.prepare('SELECT * FROM world_rule_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  updateWorldRuleTask(projectId: string, taskId: string, body: any) {
    const existing: any = this.worldRuleTaskRawById(projectId, taskId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked world rule task');
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed world rule tasks can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      taskType: 'task_type', priority: 'priority', instruction: 'instruction', reason: 'reason',
      status: 'status', reviewStatus: 'review_status', source: 'source', locked: 'locked',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'taskType') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_TASK_TYPES, camel);
      else if (camel === 'priority') fields[column] = this.ensureEnum(body[camel], TASK_PRIORITIES, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], TASK_STATUSES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else fields[column] = body[camel];
    }
    this.updateRow('world_rule_chapter_tasks', projectId, taskId, fields);
    return this.database.prepare('SELECT * FROM world_rule_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
  }

  // ===== Phase 7.4: Timeline Three-Line =====

  getTimeline(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const events = this.allTimelineEvents(projectId);
    const links = this.allTimelineLinks(projectId);
    const tasks = this.allTimelineTasks(projectId);
    const legacy = this.allLegacyTimelines(projectId);
    const characters = this.allCharacters(projectId);
    const snapshots = this.allStateSnapshots(projectId);
    const relationships = this.allRelationships(projectId);
    const outline = focusChapter ? this.getFocusOutline(projectId, focusChapter) : null;
    const focusCharacterIds = this.focusCharacterIds(characters, snapshots, relationships, focusChapter, outline);
    const focusRelationshipIds = this.getFocusRelationshipIds(projectId, focusChapter, relationships, focusCharacterIds);
    const focusForeshadowingIds = this.getFocusForeshadowingIds(projectId, focusChapter, focusCharacterIds, focusRelationshipIds);
    const focusWorldRuleIds = this.getFocusWorldRuleIds(projectId, focusChapter, focusCharacterIds, focusRelationshipIds);
    const orderMap = this.getChapterOrderMap(projectId);
    const currentChapterIndex = focusChapter ? Number(focusChapter.chapter_index || focusChapter.chapterIndex || 0) : 0;
    const currentChapterOrder = this.chapterOrder(orderMap, focusChapter?.id);

    const responseEvents = events.map(e => this.timelineEventToResponse(e, links, tasks, characters, focusChapter));
    const legacyEvents = legacy.map(item => this.legacyTimelineToResponse(item, focusChapter, currentChapterIndex));
    const allEvents = [...responseEvents, ...legacyEvents];
    const responseLinks = links.map(l => this.timelineLinkToResponse(l));

    // Step 1: Directly focused events
    const directFocusEventIds = new Set<string>();
    for (const e of responseEvents as any[]) {
      if (
        tasks.some(t => t.event_id === e.id && t.chapter_id === focusChapter?.id)
        || e.chapterId === focusChapter?.id
        || e.narrativeOrder === currentChapterIndex
        || (currentChapterOrder > 0 && Math.abs(Number(e.storyTimeOrder || 0) - currentChapterOrder) <= 1)
        || (e.relatedCharacterIds || []).some((c: string) => focusCharacterIds.has(c))
        || (e.relatedRelationshipIds || []).some((r: string) => focusRelationshipIds.has(r))
        || (e.relatedForeshadowingIds || []).some((f: string) => focusForeshadowingIds.has(f))
        || (e.relatedWorldRuleIds || []).some((w: string) => focusWorldRuleIds.has(w))
      ) { directFocusEventIds.add(e.id); }
    }

    // Step 2: Events linked via causality to directly focused events
    const causalityLinkedFocusEventIds = new Set<string>();
    for (const link of responseLinks) {
      if (directFocusEventIds.has(link.sourceEventId)) causalityLinkedFocusEventIds.add(link.targetEventId);
      if (directFocusEventIds.has(link.targetEventId)) causalityLinkedFocusEventIds.add(link.sourceEventId);
    }

    // Step 3: Combine direct + causality-linked + legacy
    const focusEvents = allEvents.filter((e: any) =>
      directFocusEventIds.has(e.id)
      || causalityLinkedFocusEventIds.has(e.id)
      || legacyEvents.some((le: any) => le.id === e.id)
    );

    const persistedFocusTasks = tasks.filter(t => t.chapter_id === focusChapter?.id).map(t => this.timelineTaskToResponse(t));
    const derivedTasks = this.buildDerivedTimelineTasks(responseEvents, focusChapter, focusCharacterIds, focusRelationshipIds, currentChapterIndex, focusForeshadowingIds, focusWorldRuleIds, currentChapterOrder);
    const persistedKeySet = new Set(persistedFocusTasks.map((t: any) => `${t.eventId}-${t.taskType}-${t.reason}`));
    const uniqueDerived = derivedTasks.filter((t: any) => !persistedKeySet.has(`${t.eventId}-${t.taskType}-${t.reason}`));
    const dedupedDerived: any[] = [];
    const derivedKeySet = new Set<string>();
    for (const t of uniqueDerived) {
      const key = `${t.eventId}-${t.taskType}-${t.reason}`;
      if (!derivedKeySet.has(key)) { derivedKeySet.add(key); dedupedDerived.push(t); }
    }
    const focusTasks = [...persistedFocusTasks, ...dedupedDerived];

    const timeConflicts = allEvents.filter(e => {
      if (e.status !== 'conflict') return false;
      return e.lineType === 'story_time';
    });
    const causalityGaps = allEvents.filter(e => {
      const hasIncoming = responseLinks.some(l => l.targetEventId === e.id);
      const hasOutgoing = responseLinks.some(l => l.sourceEventId === e.id);
      return !hasIncoming && !hasOutgoing && e.lineType === 'causality';
    });

    return {
      success: true,
      focusChapter: focusChapter || null,
      summary: {
        totalEvents: allEvents.length,
        focusEvents: focusEvents.length,
        focusTasks: focusTasks.length,
        storyTimeEvents: allEvents.filter(e => e.lineType === 'story_time').length,
        narrativeOrderEvents: allEvents.filter(e => e.lineType === 'narrative_order').length,
        causalityEvents: allEvents.filter(e => e.lineType === 'causality').length,
        causalityLinks: responseLinks.length,
        pendingReviewCount: allEvents.filter(e => e.reviewStatus === 'pending').length
        + tasks.filter(t => t.review_status === 'pending').length
        + links.filter(l => l.review_status === 'pending').length,
        timeConflictCount: timeConflicts.length,
        causalityGapCount: causalityGaps.length,
        highRiskCount: allEvents.filter(e => ['high', 'critical'].includes(e.riskLevel)).length,
        lockedCount: allEvents.filter(e => e.locked).length,
      },
      groups: {
        focusTasks,
        focusEvents,
        storyTimeLine: allEvents.filter(e => e.lineType === 'story_time'),
        narrativeOrderLine: allEvents.filter(e => e.lineType === 'narrative_order'),
        causalityLine: allEvents.filter(e => e.lineType === 'causality'),
        causalityLinks: responseLinks,
        timeConflicts,
        causalityGaps,
        highRisk: allEvents.filter(e => ['high', 'critical'].includes(e.riskLevel)),
        pendingReview: allEvents.filter(e => e.reviewStatus === 'pending'),
        legacyTimelineEvents: legacyEvents,
        allEvents,
      },
    };
  }

  // ===== Phase 7.5: Pre-writing check and post-writing update =====

  getPrecheck(projectId: string, focusChapterId?: string) {
    const context = this.buildPhase75Context(projectId, focusChapterId);
    const items: any[] = [];
    const add = (module: string, level: string, title: string, detail: string, actionHint?: string, relatedId?: string, relatedType?: string) => {
      items.push({
        id: `precheck-${module}-${items.length + 1}`,
        module,
        level,
        title,
        detail,
        evidence: context.focusChapter?.title || '',
        actionHint,
        relatedId,
        relatedType,
      });
    };

    if (!context.focusChapter) {
      add('chapter', 'blocker', '未选择当前创作章节', '写作前检查必须围绕 currentFocusChapter 执行。', '先在顶部选择当前创作章节。');
    } else {
      if (String(context.focusChapter.status || '') === 'locked') {
        add('locked', 'blocker', '当前章节已 locked', 'locked 章节不建议自动写正文，也不能被自动更新覆盖。', '如需继续写作，请先确认是否解锁或另建草稿。', context.focusChapter.id, 'chapter');
      } else {
        add('chapter', 'pass', '当前章节可编辑', '当前章节未 locked，可进入写作前检查流程。', undefined, context.focusChapter.id, 'chapter');
      }
      if (!String(context.focusChapter.title || '').trim()) {
        add('chapter', 'warning', '当前章节缺少标题', '缺少标题会降低检查结论的上下文准确度。', '先补齐章节标题。', context.focusChapter.id, 'chapter');
      }
      if (!String(context.outline?.content || '').trim()) {
        add('chapter', 'warning', '当前章节缺少大纲目标', '写作前检查没有读到当前章大纲目标。', '先在大纲中补齐本章目标。', context.focusChapter.id, 'outline');
      } else {
        add('chapter', 'pass', '当前章节大纲目标已存在', String(context.outline.content).slice(0, 180), undefined, context.outline.id, 'outline');
      }
    }

    const focusCharacters = context.characters.groups.focusCharacters || [];
    const conflictCharacters = context.characters.groups.conflictRisk || [];
    if (focusCharacters.length && !context.characters.summary.focusCharacters) {
      add('character', 'warning', '当前章人物状态快照不足', '当前章有人物线索，但缺少可直接复核的状态快照。', '到人物 Tab 补齐状态快照。');
    }
    if (conflictCharacters.length) {
      add('character', 'blocker', '人物状态存在冲突', `${conflictCharacters.length} 个相关人物存在状态冲突风险。`, '先处理人物 Tab 中的 conflict 状态。');
    } else {
      add('character', 'pass', '人物状态无明显冲突', `当前章相关人物 ${focusCharacters.length} 个。`);
    }
    if (Number(context.characters.summary.pendingStateCount || 0) > 5) {
      add('character', 'warning', '人物 pending 状态较多', `仍有 ${context.characters.summary.pendingStateCount} 条人物状态待确认。`, '写作前先确认关键状态。');
    }

    const highConflictRelationships = Number(context.relationships.summary.highConflictRelationships || 0);
    const hiddenRelationships = Number(context.relationships.summary.hiddenRelationships || 0);
    if (highConflictRelationships >= 3) add('relationship', 'blocker', '高冲突关系过多', `当前关系网有 ${highConflictRelationships} 条高冲突关系。`, '先核对关系边界。');
    else if (highConflictRelationships > 0) add('relationship', 'warning', '存在高冲突关系', `当前关系网有 ${highConflictRelationships} 条高冲突关系。`, '写作时避免关系边界错位。');
    else add('relationship', 'pass', '人物关系无明显高冲突', `当前章相关关系 ${context.relationships.summary.focusRelationships || 0} 条。`);
    if (hiddenRelationships > 0) add('relationship', 'warning', '存在隐藏关系提醒', `有 ${hiddenRelationships} 条隐藏/读者未知关系需要注意。`, '写作时确认读者已知状态。');

    if (Number(context.foreshadowings.summary.overdueCount || 0) > 0) add('foreshadowing', 'blocker', '存在逾期伏笔', `${context.foreshadowings.summary.overdueCount} 条伏笔已经逾期。`, '先处理伏笔 Tab 的逾期项。');
    if (Number(context.foreshadowings.summary.recoveryDueCount || 0) > 0) add('foreshadowing', 'warning', '存在临近回收伏笔', `${context.foreshadowings.summary.recoveryDueCount} 条伏笔临近回收。`, '写作时安排回收或延期。');
    if (Number(context.foreshadowings.summary.highRiskCount || 0) > 0) add('foreshadowing', 'warning', '存在高风险伏笔', `${context.foreshadowings.summary.highRiskCount} 条伏笔风险较高。`, '先核对伏笔生命周期。');
    if (!Number(context.foreshadowings.summary.focusTasks || 0)) add('foreshadowing', 'suggestion', '本章暂无伏笔任务', '如本章大纲涉及线索、真相或秘密，可补充伏笔任务。', '到伏笔 Tab 复核。');

    if (Number(context.worldRules.summary.conflictCount || 0) > 0) add('world', 'blocker', '存在世界观冲突', `${context.worldRules.summary.conflictCount} 条世界观规则存在冲突。`, '先解决世界观规则矛盾。');
    if (Number(context.worldRules.summary.highRiskCount || 0) > 0) add('world', 'warning', '存在高风险世界观规则', `${context.worldRules.summary.highRiskCount} 条规则高风险。`, '写作前确认不能违背。');
    if (Number(context.worldRules.summary.focusTasks || 0) > 0) add('world', 'warning', '存在当前章世界观任务', `${context.worldRules.summary.focusTasks} 个世界观任务需要处理。`, '到世界观 Tab 处理任务。');
    if (!Number(context.worldRules.summary.focusRules || 0) && this.hasWorldKeywords(context.chapterText)) {
      add('world', 'suggestion', '正文或大纲涉及世界观关键词', '当前章没有相关规则，但文本涉及地点、组织、能力或制度。', '建议补充世界观规则。');
    }

    if (Number(context.timeline.summary.timeConflictCount || 0) > 0) add('timeline', 'blocker', '存在时间冲突', `${context.timeline.summary.timeConflictCount} 个时间线冲突。`, '先校正客观故事时间。');
    if (Number(context.timeline.summary.causalityGapCount || 0) > 0) add('timeline', 'blocker', '存在因果缺口', `${context.timeline.summary.causalityGapCount} 个因果链缺口。`, '先补足事件因果链。');
    if (Number(context.timeline.summary.focusTasks || 0) > 0) add('timeline', 'warning', '存在当前章时间线任务', `${context.timeline.summary.focusTasks} 个时间线任务需要处理。`, '到时间线 Tab 处理任务。');
    if (!Number(context.timeline.summary.focusEvents || 0) && String(context.focusChapter?.content || '').trim()) {
      add('timeline', 'suggestion', '正文已有内容但缺少时间线事件', '当前章已有正文，建议补充时间线事件。', '到时间线 Tab 新增事件。');
    }

    if (context.pendingCount >= 20) add('quality', 'blocker', '待确认设定过多', `当前共有 ${context.pendingCount} 项待确认设定。`, '先处理关键 pending 项。');
    else if (context.pendingCount > 0) add('quality', 'warning', '存在待确认设定', `当前共有 ${context.pendingCount} 项待确认设定。`, '写作前不要把 pending 当作 confirmed 使用。');
    else add('quality', 'pass', '没有待确认设定阻塞', '当前未发现 pending 确认项。');

    const blockers = items.filter(i => i.level === 'blocker');
    const warnings = items.filter(i => i.level === 'warning');
    const passes = items.filter(i => i.level === 'pass');
    const suggestions = items.filter(i => i.level === 'suggestion');
    const score = Math.max(0, 100 - blockers.length * 25 - warnings.length * 8 - suggestions.length * 2);
    return {
      success: true,
      focusChapter: context.focusChapter || null,
      summary: {
        riskLevel: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'pass',
        score,
        blockCount: blockers.length,
        warningCount: warnings.length,
        passCount: passes.length,
        pendingCount: context.pendingCount,
        canStartWriting: blockers.length === 0,
      },
      groups: { blockers, warnings, passes, suggestions },
    };
  }

  getPostupdate(projectId: string, focusChapterId?: string) {
    const context = this.buildPhase75Context(projectId, focusChapterId);
    const suggestions: any[] = [];
    const add = (targetType: string, actionType: string, title: string, summary: string, evidence: string, riskLevel = 'medium', targetId?: string, lockedConflict = false, payload: Record<string, unknown> = {}) => {
      suggestions.push({
        id: `postupdate-${targetType}-${suggestions.length + 1}`,
        targetType,
        actionType,
        title,
        summary,
        evidence: evidence || context.focusChapter?.title || '',
        riskLevel,
        reviewStatus: lockedConflict || actionType === 'conflict' ? 'conflict' : 'pending',
        lockedConflict,
        targetId,
        payload: {
          ...payload,
          focusChapterId: context.focusChapter?.id || null,
          sourceChapterId: context.focusChapter?.id || null,
          suggestionType: actionType,
        },
      });
    };

    if (!context.focusChapter) {
      add('state_item', 'conflict', '未选择当前创作章节', '写作后更新必须围绕 currentFocusChapter 执行。', '', 'critical', undefined, true);
    } else if (!String(context.focusChapter.content || '').trim()) {
      add('state_item', 'conflict', '当前章没有正文', '没有正文时不能假装完成写作后更新分析。', context.focusChapter.title || '', 'critical', context.focusChapter.id, true);
    } else if (String(context.focusChapter.status || '') === 'locked') {
      add('state_item', 'conflict', '当前章已 locked', 'locked 章节不允许自动生成覆盖性更新。', context.focusChapter.title || '', 'critical', context.focusChapter.id, true);
    } else {
      const content = String(context.focusChapter.content || '');
      for (const character of (context.characters.groups.focusCharacters || [])) {
        if (character.name && content.includes(character.name)) {
          const hasLockedState = (character.latestStateSnapshots || []).some((state: any) => state.locked);
          add('character_state', 'verify', `复核人物状态：${character.name}`, `正文出现 ${character.name}，建议生成待确认人物状态复核项。`, this.evidenceAround(content, character.name), 'medium', character.id, hasLockedState, { characterId: character.id, characterName: character.name });
        }
      }
      for (const rel of (context.relationships.groups.focusRelationships || [])) {
        const a = rel.sourceCharacterName || '';
        const b = rel.targetCharacterName || '';
        if (a && b && content.includes(a) && content.includes(b)) {
          add('relationship', 'verify', `复核人物关系：${a} - ${b}`, '正文同时出现关系双方，建议复核关系边界与读者已知状态。', this.evidenceAround(content, a), 'medium', rel.id, Boolean(rel.locked), { relationshipId: rel.id });
        }
      }
      if (this.hasForeshadowingKeywords(content)) {
        add('foreshadowing', 'verify', '复核伏笔生命周期', '正文出现伏笔、线索、秘密、真相或回收相关关键词。', this.keywordEvidence(content, ['伏笔', '线索', '秘密', '真相', '回收']), 'medium', undefined, false, { keywordSource: 'chapter_content' });
      }
      if (this.hasWorldKeywords(content)) {
        add('world_rule', 'verify', '复核世界观规则使用', '正文涉及地点、组织、能力体系、规则或制度，建议生成待确认世界观验证项。', this.keywordEvidence(content, ['地点', '组织', '能力', '规则', '制度', '世界观']), 'medium', undefined, false, { keywordSource: 'chapter_content' });
      }
      if (this.hasTimelineKeywords(content)) {
        add('timeline_event', 'verify', '复核时间线 / 因果链', '正文出现时间、先后、因为、所以、导致等关键词，建议补充时间线事件或因果链。', this.keywordEvidence(content, ['时间', '随后', '此前', '因为', '所以', '导致', '后来']), 'medium', undefined, false, { keywordSource: 'chapter_content' });
      }
      for (const rule of (context.worldRules.groups.activeRules || [])) {
        const needle = rule.title || rule.content || '';
        if (needle && content.includes(String(needle).slice(0, 8))) {
          add('world_rule', rule.locked ? 'conflict' : 'verify', `验证世界观规则：${rule.title}`, '正文疑似使用已登记世界观规则，需作者确认是否一致。', this.evidenceAround(content, String(needle).slice(0, 8)), rule.locked ? 'high' : 'medium', rule.id, Boolean(rule.locked), { ruleId: rule.id });
        }
      }
    }

    const characterUpdates = suggestions.filter(s => s.targetType === 'character_state');
    const relationshipUpdates = suggestions.filter(s => s.targetType === 'relationship');
    const foreshadowingUpdates = suggestions.filter(s => s.targetType === 'foreshadowing');
    const worldRuleUpdates = suggestions.filter(s => s.targetType === 'world_rule');
    const timelineUpdates = suggestions.filter(s => s.targetType === 'timeline_event' || s.targetType === 'timeline_link');
    const conflicts = suggestions.filter(s => s.reviewStatus === 'conflict' || s.lockedConflict);
    const ignored = suggestions.filter(s => s.reviewStatus === 'ignored');
    return {
      success: true,
      focusChapter: context.focusChapter || null,
      summary: {
        suggestionCount: suggestions.length,
        conflictCount: conflicts.length,
        pendingCount: suggestions.filter(s => s.reviewStatus === 'pending').length,
        lockedConflictCount: suggestions.filter(s => s.lockedConflict).length,
        canApplySafely: Boolean(context.focusChapter && String(context.focusChapter.content || '').trim() && context.focusChapter.status !== 'locked'),
      },
      groups: { characterUpdates, relationshipUpdates, foreshadowingUpdates, worldRuleUpdates, timelineUpdates, conflicts, ignored },
    };
  }

  applyPostupdateSuggestion(projectId: string, suggestionId: string, suggestion: any, status: 'pending' | 'ignored' | 'conflict') {
    if (!suggestion || !String(suggestion.title || '').trim()) throw new BadRequestException('suggestion payload is required');
    const now = new Date().toISOString();
    const summary = String(suggestion.summary || suggestion.title).slice(0, 800);
    const targetType = String(suggestion.targetType || 'continuity_postupdate');
    const targetId = suggestion.targetId || null;
    const hash = this.hashSummary(summary);
    const existing = this.database.prepare(`
      SELECT * FROM state_items
      WHERE project_id = ? AND target_type = ? AND IFNULL(target_id, '') = IFNULL(?, '') AND summary_hash = ?
      LIMIT 1
    `).get(projectId, targetType, targetId, hash) as any;
    if (existing) return { success: true, status: existing.status, stateItem: existing, deduped: true };

    const id = uuid();
    const payload = {
      ...(suggestion.payload || {}),
      intent: 'review_only',
      suggestionId,
      evidence: suggestion.evidence || '',
      riskLevel: suggestion.riskLevel || 'medium',
      lockedConflict: Boolean(suggestion.lockedConflict),
      actionType: suggestion.actionType || 'verify',
      reviewStatus: status,
    };
    this.database.prepare(`
      INSERT INTO state_items (
        id, project_id, source_type, source_id, source_chapter_id, target_type, target_id, target_label,
        state_key, title, summary, content, payload, status, authority, source, confidence, tags,
        impact_scope, summary_hash, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, 'ai', suggestionId, payload.sourceChapterId || payload.focusChapterId || null,
      targetType, targetId, suggestion.title || targetType, suggestion.actionType || 'verify',
      suggestion.title, summary, suggestion.evidence || summary, JSON.stringify(payload),
      status, status === 'conflict' ? 'warning' : status === 'ignored' ? 'excluded' : 'soft_candidate',
      'phase_7_5_postupdate', 0.6, JSON.stringify(['phase7.5', 'postupdate', suggestion.actionType || 'verify']),
      JSON.stringify([payload.focusChapterId || payload.sourceChapterId || null].filter(Boolean)),
      hash, 'system', now, now,
    );
    const stateItem = this.database.prepare('SELECT * FROM state_items WHERE project_id = ? AND id = ?').get(projectId, id);
    return { success: true, status, stateItem, deduped: false };
  }

  createTimelineEvent(projectId: string, body: any) {
    if (!String(body?.title || '').trim()) throw new BadRequestException('title is required');
    const lineType = this.ensureEnum(body.lineType || 'story_time', TIMELINE_LINE_TYPES, 'lineType');
    const readerKnownState = this.ensureEnum(body.readerKnownState || 'unknown', READER_STATES, 'readerKnownState');
    const characterKnownState = this.ensureEnum(body.characterKnownState || 'unknown', CHARACTER_KNOWN_STATES, 'characterKnownState');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO timeline_three_line_events (
        id, project_id, title, summary, line_type, chapter_id, volume_index, chapter_index,
        story_time_text, story_time_order, narrative_order, causality_order, location,
        participants_character_ids, related_relationship_ids, related_foreshadowing_ids,
        related_world_rule_ids, reader_known_state, character_known_state, status, risk_level,
        risk_reason, review_status, locked, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, String(body.title).trim(), body.summary || '', lineType,
      body.chapterId || null, numberOrNull(body.volumeIndex), numberOrNull(body.chapterIndex),
      body.storyTimeText || '', numberOrDefault(body.storyTimeOrder, 0), numberOrDefault(body.narrativeOrder, 0),
      numberOrDefault(body.causalityOrder, 0), body.location || '',
      JSON.stringify(body.participantsCharacterIds || []), JSON.stringify(body.relatedRelationshipIds || []),
      JSON.stringify(body.relatedForeshadowingIds || []), JSON.stringify(body.relatedWorldRuleIds || []),
      readerKnownState, characterKnownState, 'planned',
      this.ensureEnum(body.riskLevel || 'none', WORLD_RULE_RISK_LEVELS, 'riskLevel'),
      body.riskReason || '', 'pending', 0, this.normalizeSource(body.source),
      numberOrDefault(body.confidence, 1), now, now,
    );
    return this.database.prepare('SELECT * FROM timeline_three_line_events WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  updateTimelineEvent(projectId: string, eventId: string, body: any) {
    const existing: any = this.timelineEventRawById(projectId, eventId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked timeline event');
    const coreFields = ['title', 'summary', 'storyTimeText', 'location'];
    if (Number(existing.locked) === 1 && !body.forceUnlock && coreFields.some(f => body[f] !== undefined)) {
      throw new ConflictException('Cannot modify locked timeline event without forceUnlock=true');
    }
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed timeline events can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      title: 'title', summary: 'summary', lineType: 'line_type', chapterId: 'chapter_id',
      volumeIndex: 'volume_index', chapterIndex: 'chapter_index', storyTimeText: 'story_time_text',
      storyTimeOrder: 'story_time_order', narrativeOrder: 'narrative_order', causalityOrder: 'causality_order',
      location: 'location', readerKnownState: 'reader_known_state', characterKnownState: 'character_known_state',
      status: 'status', riskLevel: 'risk_level', riskReason: 'risk_reason',
      reviewStatus: 'review_status', locked: 'locked', source: 'source',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'lineType') fields[column] = this.ensureEnum(body[camel], TIMELINE_LINE_TYPES, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], TIMELINE_EVENT_STATUSES, camel);
      else if (camel === 'riskLevel') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_RISK_LEVELS, camel);
      else if (camel === 'readerKnownState') fields[column] = this.ensureEnum(body[camel], READER_STATES, camel);
      else if (camel === 'characterKnownState') fields[column] = this.ensureEnum(body[camel], CHARACTER_KNOWN_STATES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else fields[column] = body[camel];
    }
    if (body.participantsCharacterIds !== undefined) fields.participants_character_ids = JSON.stringify(body.participantsCharacterIds || []);
    if (body.relatedRelationshipIds !== undefined) fields.related_relationship_ids = JSON.stringify(body.relatedRelationshipIds || []);
    if (body.relatedForeshadowingIds !== undefined) fields.related_foreshadowing_ids = JSON.stringify(body.relatedForeshadowingIds || []);
    if (body.relatedWorldRuleIds !== undefined) fields.related_world_rule_ids = JSON.stringify(body.relatedWorldRuleIds || []);
    this.updateRow('timeline_three_line_events', projectId, eventId, fields);
    return this.database.prepare('SELECT * FROM timeline_three_line_events WHERE project_id = ? AND id = ?').get(projectId, eventId);
  }

  createTimelineLink(projectId: string, body: any) {
    if (!body?.sourceEventId || !body?.targetEventId) throw new BadRequestException('sourceEventId and targetEventId are required');
    if (body.sourceEventId === body.targetEventId) throw new BadRequestException('sourceEventId and targetEventId cannot be the same');
    this.timelineEventRawById(projectId, body.sourceEventId);
    this.timelineEventRawById(projectId, body.targetEventId);
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO timeline_causality_links (
        id, project_id, source_event_id, target_event_id, link_type, summary, evidence,
        risk_level, risk_reason, review_status, locked, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.sourceEventId, body.targetEventId,
      this.ensureEnum(body.linkType || 'cause', TIMELINE_LINK_TYPES, 'linkType'),
      body.summary || '', body.evidence || '',
      this.ensureEnum(body.riskLevel || 'none', WORLD_RULE_RISK_LEVELS, 'riskLevel'),
      body.riskReason || '', 'pending', 0, this.normalizeSource(body.source),
      numberOrDefault(body.confidence, 1), now, now,
    );
    return this.database.prepare('SELECT * FROM timeline_causality_links WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  updateTimelineLink(projectId: string, linkId: string, body: any) {
    const existing: any = this.timelineLinkRawById(projectId, linkId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked timeline link');
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed timeline links can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      linkType: 'link_type', summary: 'summary', evidence: 'evidence',
      riskLevel: 'risk_level', riskReason: 'risk_reason', reviewStatus: 'review_status', locked: 'locked', source: 'source',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'linkType') fields[column] = this.ensureEnum(body[camel], TIMELINE_LINK_TYPES, camel);
      else if (camel === 'riskLevel') fields[column] = this.ensureEnum(body[camel], WORLD_RULE_RISK_LEVELS, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else fields[column] = body[camel];
    }
    this.updateRow('timeline_causality_links', projectId, linkId, fields);
    return this.database.prepare('SELECT * FROM timeline_causality_links WHERE project_id = ? AND id = ?').get(projectId, linkId);
  }

  createTimelineTask(projectId: string, body: any) {
    if (!body?.eventId || !body?.chapterId) throw new BadRequestException('eventId and chapterId are required');
    this.timelineEventRawById(projectId, body.eventId);
    const chapter = this.getChapter(projectId, body.chapterId);
    if (!chapter) throw new BadRequestException('chapterId must reference an existing chapter');
    const now = new Date().toISOString();
    const id = uuid();
    this.database.prepare(`
      INSERT INTO timeline_chapter_tasks (
        id, project_id, event_id, chapter_id, task_type, priority, instruction, reason,
        status, review_status, source, locked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, body.eventId, body.chapterId,
      this.ensureEnum(body.taskType || 'check_order', TIMELINE_TASK_TYPES, 'taskType'),
      this.ensureEnum(body.priority || 'medium', TASK_PRIORITIES, 'priority'),
      body.instruction || '', body.reason || '', 'todo', 'pending', this.normalizeSource(body.source), 0, now, now,
    );
    return this.database.prepare('SELECT * FROM timeline_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, id);
  }

  updateTimelineTask(projectId: string, taskId: string, body: any) {
    const existing: any = this.timelineTaskRawById(projectId, taskId);
    const normalizedSource = body.source !== undefined ? this.normalizeSource(body.source) : undefined;
    if (Number(existing.locked) === 1 && normalizedSource === 'ai') throw new ConflictException('Cannot let AI overwrite locked timeline task');
    const nextReviewStatus = body.reviewStatus !== undefined
      ? this.ensureEnum(body.reviewStatus, REVIEW_STATUSES, 'reviewStatus')
      : existing.review_status;
    if (body.locked === true && nextReviewStatus !== 'confirmed') throw new BadRequestException('Only confirmed timeline tasks can be locked');
    const fields: Record<string, unknown> = {};
    const map: Record<string, string> = {
      taskType: 'task_type', priority: 'priority', instruction: 'instruction', reason: 'reason',
      status: 'status', reviewStatus: 'review_status', source: 'source', locked: 'locked',
    };
    for (const [camel, column] of Object.entries(map)) {
      if (body[camel] === undefined) continue;
      if (camel === 'taskType') fields[column] = this.ensureEnum(body[camel], TIMELINE_TASK_TYPES, camel);
      else if (camel === 'priority') fields[column] = this.ensureEnum(body[camel], TASK_PRIORITIES, camel);
      else if (camel === 'status') fields[column] = this.ensureEnum(body[camel], TASK_STATUSES, camel);
      else if (camel === 'reviewStatus') fields[column] = nextReviewStatus;
      else if (camel === 'source') fields[column] = this.normalizeSource(body[camel]);
      else if (camel === 'locked') fields[column] = body[camel] ? 1 : 0;
      else fields[column] = body[camel];
    }
    this.updateRow('timeline_chapter_tasks', projectId, taskId, fields);
    return this.database.prepare('SELECT * FROM timeline_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
  }

  private allForeshadowingThreads(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM foreshadowing_threads WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allForeshadowingEvents(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM foreshadowing_lifecycle_events WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allForeshadowingTasks(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM foreshadowing_chapter_tasks WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allLegacyForeshadowings(projectId: string): any[] {
    try {
      return this.database.prepare('SELECT * FROM foreshadowings WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
    } catch {
      return [];
    }
  }

  private foreshadowingRawById(projectId: string, threadId: string) {
    const row = this.database.prepare('SELECT * FROM foreshadowing_threads WHERE project_id = ? AND id = ?').get(projectId, threadId);
    if (!row) throw new NotFoundException(`Foreshadowing thread ${threadId} not found`);
    return row;
  }

  private foreshadowingTaskRawById(projectId: string, taskId: string) {
    const row = this.database.prepare('SELECT * FROM foreshadowing_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
    if (!row) throw new NotFoundException(`Foreshadowing task ${taskId} not found`);
    return row;
  }

  private foreshadowingById(projectId: string, threadId: string) {
    const events = this.allForeshadowingEvents(projectId);
    const tasks = this.allForeshadowingTasks(projectId);
    return this.foreshadowingToResponse(this.foreshadowingRawById(projectId, threadId), events, tasks, null);
  }

  private foreshadowingToResponse(row: any, events: any[], tasks: any[], focusChapter: any | null) {
    const latestEvents = events.filter(event => event.thread_id === row.id).map(event => ({
      id: event.id,
      chapterId: event.chapter_id,
      eventType: event.event_type,
      summary: event.summary || '',
      readerEffect: event.reader_effect || '',
      trueEffect: event.true_effect || '',
      evidence: event.evidence || '',
      impact: event.impact || '',
      reviewStatus: event.review_status,
      source: event.source,
      updatedAt: event.updated_at,
    }));
    const focusTasks = tasks.filter(task => task.thread_id === row.id && (!focusChapter || task.chapter_id === focusChapter.id)).map(task => this.taskToResponse(task));
    return {
      id: row.id,
      title: row.title,
      level: row.level,
      volumeIndex: row.volume_index,
      status: row.status,
      summary: row.summary || '',
      readerUnderstanding: row.reader_understanding || '',
      trueMeaning: row.true_meaning || '',
      revealStrategy: row.reveal_strategy || '',
      riskLevel: row.risk_level || 'none',
      riskReason: row.risk_reason || '',
      plannedBuryChapterId: row.planned_bury_chapter_id || null,
      actualBuryChapterId: row.actual_bury_chapter_id || null,
      plannedDeepenChapterIds: parseJson(row.planned_deepen_chapter_ids, []),
      plannedMisdirectChapterIds: parseJson(row.planned_misdirect_chapter_ids, []),
      recoveryWindowStartChapterId: row.recovery_window_start_chapter_id || null,
      recoveryWindowEndChapterId: row.recovery_window_end_chapter_id || null,
      actualRecoveryChapterId: row.actual_recovery_chapter_id || null,
      relatedCharacterIds: parseJson(row.related_character_ids, []),
      relatedRelationshipIds: parseJson(row.related_relationship_ids, []),
      relatedTimelineEventIds: parseJson(row.related_timeline_event_ids, []),
      reviewStatus: row.review_status,
      locked: Number(row.locked) === 1,
      source: row.source || 'manual',
      updatedAt: row.updated_at,
      latestEvents,
      focusTasks,
      legacy: false,
    };
  }

  private taskToResponse(task: any, thread?: any) {
    return {
      id: task.id,
      threadId: task.thread_id,
      threadTitle: thread?.title,
      chapterId: task.chapter_id,
      taskType: task.task_type,
      priority: task.priority,
      instruction: task.instruction || '',
      reason: task.reason || '',
      status: task.status,
      reviewStatus: task.review_status,
      source: task.source,
      locked: Number(task.locked) === 1,
      updatedAt: task.updated_at,
    };
  }

  private legacyForeshadowingToResponse(row: any, currentChapterIndex: number, focusChapter: any | null) {
    const buryIndex = Number(row.buried_chapter_index || 0);
    const plannedRecovery = Number(row.planned_recovery_chapter_index || 0);
    const actualRecovery = Number(row.actual_recovery_chapter_index || 0);
    const status = actualRecovery ? 'recovered' : plannedRecovery && plannedRecovery < currentChapterIndex ? 'overdue' : (row.status || 'planned');
    const focusTasks = [];
    if (focusChapter && buryIndex === currentChapterIndex) {
      focusTasks.push({
        id: `legacy-${row.id}-bury`,
        threadId: `legacy-${row.id}`,
        threadTitle: row.content,
        chapterId: focusChapter.id,
        taskType: 'bury',
        priority: row.importance >= 4 ? 'high' : 'medium',
        instruction: row.content,
        reason: 'legacy foreshadowings buried chapter matches current chapter',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'legacy_import',
        locked: false,
        updatedAt: row.updated_at,
      });
    }
    if (focusChapter && plannedRecovery === currentChapterIndex && !actualRecovery) {
      focusTasks.push({
        id: `legacy-${row.id}-recover`,
        threadId: `legacy-${row.id}`,
        threadTitle: row.content,
        chapterId: focusChapter.id,
        taskType: 'recover',
        priority: 'high',
        instruction: row.content,
        reason: 'legacy planned recovery chapter matches current chapter',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'legacy_import',
        locked: false,
        updatedAt: row.updated_at,
      });
    }
    return {
      id: `legacy-${row.id}`,
      legacyForeshadowingId: row.id,
      title: row.content || 'legacy foreshadowing',
      level: row.scope === 'volume' ? 'volume' : row.scope === 'full_book' ? 'full_book' : 'chapter',
      volumeIndex: row.volume_index,
      status,
      summary: row.content || '',
      readerUnderstanding: '',
      trueMeaning: '',
      revealStrategy: '',
      riskLevel: status === 'overdue' ? 'high' : 'none',
      riskReason: status === 'overdue' ? 'legacy planned recovery is overdue' : '',
      plannedBuryChapterId: null,
      actualBuryChapterId: null,
      legacyBuryChapterIndex: buryIndex || null,
      legacyRecoveryChapterIndex: plannedRecovery || null,
      recoveryWindowStartChapterId: null,
      recoveryWindowEndChapterId: null,
      actualRecoveryChapterId: null,
      relatedCharacterIds: parseJson(row.related_character_ids, []),
      relatedRelationshipIds: [],
      relatedTimelineEventIds: [],
      reviewStatus: 'pending',
      locked: false,
      source: 'legacy_import',
      updatedAt: row.updated_at,
      latestEvents: [],
      focusTasks,
      legacy: true,
    };
  }

  private isRecoveryDue(thread: any, focusChapter: any | null, currentChapterIndex: number, orderMap: Map<string, number>): boolean {
    if (thread.status === 'recovered') return false;
    if (thread.status === 'recovery_due') return true;
    // Legacy: check planned recovery chapter index within 2
    if (thread.legacyRecoveryChapterIndex) {
      return Math.abs(Number(thread.legacyRecoveryChapterIndex) - currentChapterIndex) <= 2 && !thread.actualRecoveryChapterId;
    }
    if (!focusChapter) return false;
    // Current chapter within recovery window
    if (this.isChapterWithinWindow(orderMap, focusChapter.id, thread.recoveryWindowStartChapterId, thread.recoveryWindowEndChapterId)) {
      return true;
    }
    // Current chapter within 2 chapters of window start or end
    const currentOrder = this.chapterOrder(orderMap, focusChapter.id);
    if (currentOrder === 0) return false;
    if (thread.recoveryWindowStartChapterId) {
      const startOrder = this.chapterOrder(orderMap, thread.recoveryWindowStartChapterId);
      if (startOrder > 0 && Math.abs(currentOrder - startOrder) <= 2) return true;
    }
    if (thread.recoveryWindowEndChapterId) {
      const endOrder = this.chapterOrder(orderMap, thread.recoveryWindowEndChapterId);
      if (endOrder > 0 && Math.abs(currentOrder - endOrder) <= 2) return true;
    }
    return false;
  }

  private isOverdue(thread: any, focusChapter: any | null, currentChapterIndex: number, orderMap: Map<string, number>): boolean {
    if (thread.status === 'overdue') return true;
    // Legacy: planned recovery chapter index < current chapter index, and not recovered
    if (thread.legacyRecoveryChapterIndex) {
      return Number(thread.legacyRecoveryChapterIndex) < currentChapterIndex && thread.status !== 'recovered';
    }
    // New table: must have recoveryWindowEndChapterId, no actual recovery, and current chapter past the window
    if (!focusChapter || !thread.recoveryWindowEndChapterId || thread.actualRecoveryChapterId || thread.status === 'recovered') return false;
    const currentOrder = this.chapterOrder(orderMap, focusChapter.id);
    const endOrder = this.chapterOrder(orderMap, thread.recoveryWindowEndChapterId);
    // Can't determine order => don't mis-judge
    if (currentOrder === 0 || endOrder === 0) return false;
    return currentOrder > endOrder;
  }

  private buildPhase75Context(projectId: string, focusChapterId?: string) {
    const focusChapter = this.getChapter(projectId, focusChapterId);
    const outline = focusChapter ? this.getFocusOutline(projectId, focusChapter) : null;
    const characters = this.getCharacters(projectId, focusChapterId);
    const relationships = this.getRelationships(projectId, focusChapterId);
    const foreshadowings = this.getForeshadowings(projectId, focusChapterId);
    const worldRules = this.getWorldRules(projectId, focusChapterId);
    const timeline = this.getTimeline(projectId, focusChapterId);
    const chapterText = [
      focusChapter?.title || '',
      focusChapter?.content || '',
      outline?.title || '',
      outline?.content || '',
    ].filter(Boolean).join('\n');
    const pendingCount = Number(characters.summary?.pendingStateCount || 0)
      + Number(relationships.summary?.pendingReviewCount || 0)
      + Number(foreshadowings.summary?.pendingReviewCount || 0)
      + Number(worldRules.summary?.pendingReviewCount || 0)
      + Number(timeline.summary?.pendingReviewCount || 0);
    return { focusChapter, outline, characters, relationships, foreshadowings, worldRules, timeline, pendingCount, chapterText };
  }

  private hasForeshadowingKeywords(text: string) {
    return this.containsAny(text, ['伏笔', '线索', '秘密', '真相', '回收', '暗示', '误导', '揭开', '隐藏', '谜团', '证据', '痕迹', '异常', '不对劲']);
  }

  private hasWorldKeywords(text: string) {
    return this.containsAny(text, ['世界观', '规则', '制度', '组织', '宗门', '公司', '部门', '法律', '法规', '地点', '城市', '国家', '村', '镇', '学校', '医院', '能力', '异能', '修炼', '功法', '资源', '货币', '阶层', '职业']);
  }

  private hasTimelineKeywords(text: string) {
    return this.containsAny(text, ['时间', '当天', '第二天', '随后', '此前', '之前', '之后', '后来', '因为', '所以', '导致', '结果', '同时', '先', '再', '终于', '过去', '现在', '未来', '回忆']);
  }

  private containsAny(text: string, keywords: string[]): boolean {
    const source = String(text || '').toLowerCase();
    return keywords.some(keyword => source.includes(keyword.toLowerCase()));
  }

  private evidenceAround(text: string, keyword: string, radius = 60): string {
    const source = String(text || '');
    const key = String(keyword || '');
    if (!source || !key) return '';
    const index = source.indexOf(key);
    if (index < 0) return source.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    const end = Math.min(source.length, index + key.length + radius);
    return source.slice(start, end);
  }

  private keywordEvidence(text: string, keywords: string[]) {
    const source = String(text || '');
    const hit = keywords.find(keyword => source.includes(keyword));
    return hit ? this.evidenceAround(source, hit) : source.slice(0, 120);
  }

  private hashSummary(value: string): string {
    const source = String(value || '');
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
    }
    return `phase75-${Math.abs(hash)}`;
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

  private getChapterOrderMap(projectId: string): Map<string, number> {
    const chapters = this.database.prepare(
      'SELECT id, volume_index, chapter_index FROM chapters WHERE project_id = ? ORDER BY volume_index ASC, chapter_index ASC'
    ).all(projectId) as any[];
    const map = new Map<string, number>();
    chapters.forEach((ch, index) => {
      map.set(ch.id, index + 1);
    });
    return map;
  }

  private chapterOrder(orderMap: Map<string, number>, chapterId?: string | null): number {
    if (!chapterId) return 0;
    return orderMap.get(chapterId) || 0;
  }

  private isChapterWithinWindow(
    orderMap: Map<string, number>,
    currentChapterId: string,
    startChapterId?: string | null,
    endChapterId?: string | null,
  ): boolean {
    const currentOrder = this.chapterOrder(orderMap, currentChapterId);
    if (currentOrder === 0) return false;
    if (startChapterId && endChapterId) {
      const start = this.chapterOrder(orderMap, startChapterId);
      const end = this.chapterOrder(orderMap, endChapterId);
      if (start > 0 && end > 0) return currentOrder >= start && currentOrder <= end;
    }
    if (startChapterId) {
      const start = this.chapterOrder(orderMap, startChapterId);
      if (start > 0) return currentOrder >= start;
    }
    if (endChapterId) {
      const end = this.chapterOrder(orderMap, endChapterId);
      if (end > 0) return currentOrder <= end;
    }
    return false;
  }

  private buildDerivedForeshadowingTasks(
    thread: any,
    focusChapter: any | null,
    orderMap: Map<string, number>,
    events: any[],
    focusCharacterIds: Set<string>,
    focusRelationshipIds: Set<string>,
  ): any[] {
    if (!focusChapter) return [];
    const derived: any[] = [];
    const threadEvents = events.filter(event => event.thread_id === thread.id && event.chapter_id === focusChapter.id);

    // 1. planned_bury_chapter_id hits current chapter
    if (thread.plannedBuryChapterId === focusChapter.id) {
      derived.push({
        id: `radar-${thread.id}-planned-bury`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'bury',
        priority: 'high',
        instruction: `本章计划埋设伏笔：${thread.title}`,
        reason: 'planned_bury_chapter_id 命中当前章',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 2. actual_bury_chapter_id hits current chapter
    if (thread.actualBuryChapterId === focusChapter.id) {
      derived.push({
        id: `radar-${thread.id}-actual-bury`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'check',
        priority: 'medium',
        instruction: `本章已埋设伏笔，需要检查呈现是否一致：${thread.title}`,
        reason: 'actual_bury_chapter_id 命中当前章',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 3. lifecycle events hitting current chapter
    for (const event of threadEvents) {
      const eventTypeMap: Record<string, string> = {
        buried: 'bury',
        deepened: 'deepen',
        misdirected: 'misdirect',
        recovered: 'recover',
        hinted: 'check',
        conflict: 'avoid_contradiction',
      };
      const taskType = eventTypeMap[event.event_type] || 'check';
      derived.push({
        id: `radar-${thread.id}-event-${event.id || threadEvents.indexOf(event)}`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType,
        priority: 'medium',
        instruction: `本章存在伏笔事件：${event.summary || thread.title}`,
        reason: 'lifecycle event 命中当前章',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 4. actual_recovery_chapter_id hits current chapter
    if (thread.actualRecoveryChapterId === focusChapter.id) {
      derived.push({
        id: `radar-${thread.id}-actual-recover`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'recover',
        priority: 'high',
        instruction: `本章已回收伏笔，需要检查回收是否闭合：${thread.title}`,
        reason: 'actual_recovery_chapter_id 命中当前章',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 5. current chapter within recovery window
    if (this.isChapterWithinWindow(orderMap, focusChapter.id, thread.recoveryWindowStartChapterId, thread.recoveryWindowEndChapterId)) {
      derived.push({
        id: `radar-${thread.id}-recovery-window`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'recover',
        priority: 'high',
        instruction: `本章处于伏笔回收窗口，需要考虑是否回收：${thread.title}`,
        reason: '当前章处于 recovery window',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 6. related_character_ids intersects focus characters
    const threadChars = thread.relatedCharacterIds || [];
    if (threadChars.some((charId: string) => focusCharacterIds.has(charId))) {
      derived.push({
        id: `radar-${thread.id}-char-related`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'check',
        priority: 'medium',
        instruction: `本章人物关联伏笔，需要检查人物状态与伏笔一致：${thread.title}`,
        reason: 'related_character_ids 与当前章人物相交',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    // 7. related_relationship_ids intersects focus relationships
    const threadRels = thread.relatedRelationshipIds || [];
    if (threadRels.some((relId: string) => focusRelationshipIds.has(relId))) {
      derived.push({
        id: `radar-${thread.id}-rel-related`,
        threadId: thread.id,
        threadTitle: thread.title,
        chapterId: focusChapter.id,
        taskType: 'check',
        priority: 'medium',
        instruction: `本章关系关联伏笔，需要检查关系变化与伏笔一致：${thread.title}`,
        reason: 'related_relationship_ids 与当前章关系相交',
        status: 'todo',
        reviewStatus: 'pending',
        source: 'radar_derived',
        locked: false,
        derived: true,
      });
    }

    return derived;
  }

  

  private getFocusForeshadowingIds(projectId: string, focusChapter: any | null, focusCharacterIds: Set<string>, focusRelationshipIds: Set<string>): Set<string> {
    const ids = new Set<string>();
    if (!focusChapter) return ids;
    const tasks = this.allForeshadowingTasks(projectId);
    const events = this.allForeshadowingEvents(projectId);
    const threads = this.allForeshadowingThreads(projectId);
    for (const t of tasks) { if (t.chapter_id === focusChapter.id) ids.add(t.thread_id); }
    for (const e of events) { if (e.chapter_id === focusChapter.id) ids.add(e.thread_id); }
    for (const th of threads) {
      if (th.planned_bury_chapter_id === focusChapter.id || th.actual_bury_chapter_id === focusChapter.id || th.actual_recovery_chapter_id === focusChapter.id) {
        ids.add(th.id);
      }
      const chars = JSON.parse(th.related_character_ids || '[]');
      if (chars.some((c: string) => focusCharacterIds.has(c))) ids.add(th.id);
      const rels = JSON.parse(th.related_relationship_ids || '[]');
      if (rels.some((r: string) => focusRelationshipIds.has(r))) ids.add(th.id);
    }
    return ids;
  }

  private getFocusTimelineEventIds(projectId: string, focusChapter: any | null, focusCharacterIds: Set<string>, focusRelationshipIds: Set<string>): Set<string> {
    const ids = new Set<string>();
    if (!focusChapter) return ids;
    const tasks = this.allTimelineTasks(projectId);
    const events = this.allTimelineEvents(projectId);
    for (const t of tasks) { if (t.chapter_id === focusChapter.id) ids.add(t.event_id); }
    for (const e of events) {
      if (e.chapter_id === focusChapter.id) ids.add(e.id);
      const chars = JSON.parse(e.participants_character_ids || '[]');
      if (chars.some((c: string) => focusCharacterIds.has(c))) ids.add(e.id);
      const rels = JSON.parse(e.related_relationship_ids || '[]');
      if (rels.some((r: string) => focusRelationshipIds.has(r))) ids.add(e.id);
    }
    return ids;
  }

  private getFocusWorldRuleIds(projectId: string, focusChapter: any | null, focusCharacterIds: Set<string>, focusRelationshipIds: Set<string>): Set<string> {
    const ids = new Set<string>();
    if (!focusChapter) return ids;
    const tasks = this.allWorldRuleTasks(projectId);
    const events = this.allWorldRuleEvents(projectId);
    const rules = this.allWorldRules(projectId);
    for (const t of tasks) { if (t.chapter_id === focusChapter.id) ids.add(t.rule_id); }
    for (const e of events) { if (e.chapter_id === focusChapter.id) ids.add(e.rule_id); }
    for (const r of rules) {
      if (r.first_established_chapter_id === focusChapter.id || r.last_verified_chapter_id === focusChapter.id) ids.add(r.id);
      const chars = JSON.parse(r.related_character_ids || '[]');
      if (chars.some((c: string) => focusCharacterIds.has(c))) ids.add(r.id);
      const rels = JSON.parse(r.related_relationship_ids || '[]');
      if (rels.some((rel: string) => focusRelationshipIds.has(rel))) ids.add(r.id);
    }
    return ids;
  }

    private getFocusRelationshipIds(projectId: string, focusChapter: any | null, relationships: any[], focusCharacterIds: Set<string>): Set<string> {
    const ids = new Set<string>();
    if (!focusChapter) return ids;
    const relEvents = this.allRelationshipEvents(projectId);
    for (const rel of relationships) {
      if (rel.first_chapter_id === focusChapter.id || rel.latest_chapter_id === focusChapter.id) ids.add(rel.id);
      if (focusCharacterIds.has(rel.source_character_id) && focusCharacterIds.has(rel.target_character_id)) ids.add(rel.id);
    }
    for (const event of relEvents) {
      if (event.chapter_id === focusChapter.id) ids.add(event.relationship_id);
    }
    return ids;
  }

  private allWorldRules(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM world_rules WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allWorldRuleEvents(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM world_rule_events WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allWorldRuleTasks(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM world_rule_chapter_tasks WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allTimelineEvents(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM timeline_three_line_events WHERE project_id = ? ORDER BY COALESCE(story_time_order, 0), updated_at DESC').all(projectId) as any[];
  }

  private allTimelineLinks(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM timeline_causality_links WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allTimelineTasks(projectId: string): any[] {
    return this.database.prepare('SELECT * FROM timeline_chapter_tasks WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  }

  private allLegacyTimelines(projectId: string): any[] {
    try {
      return this.database.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY event_date ASC, updated_at DESC').all(projectId) as any[];
    } catch {
      return [];
    }
  }

  private worldRuleRawById(projectId: string, ruleId: string) {
    const row = this.database.prepare('SELECT * FROM world_rules WHERE project_id = ? AND id = ?').get(projectId, ruleId);
    if (!row) throw new NotFoundException(`World rule ${ruleId} not found`);
    return row;
  }

  private worldRuleById(projectId: string, ruleId: string) {
    const events = this.allWorldRuleEvents(projectId);
    const tasks = this.allWorldRuleTasks(projectId);
    return this.worldRuleToResponse(this.worldRuleRawById(projectId, ruleId), events, tasks, null);
  }

  private worldRuleTaskRawById(projectId: string, taskId: string) {
    const row = this.database.prepare('SELECT * FROM world_rule_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
    if (!row) throw new NotFoundException(`World rule task ${taskId} not found`);
    return row;
  }

  private timelineEventRawById(projectId: string, eventId: string) {
    const row = this.database.prepare('SELECT * FROM timeline_three_line_events WHERE project_id = ? AND id = ?').get(projectId, eventId);
    if (!row) throw new NotFoundException(`Timeline event ${eventId} not found`);
    return row;
  }

  private timelineLinkRawById(projectId: string, linkId: string) {
    const row = this.database.prepare('SELECT * FROM timeline_causality_links WHERE project_id = ? AND id = ?').get(projectId, linkId);
    if (!row) throw new NotFoundException(`Timeline link ${linkId} not found`);
    return row;
  }

  private timelineTaskRawById(projectId: string, taskId: string) {
    const row = this.database.prepare('SELECT * FROM timeline_chapter_tasks WHERE project_id = ? AND id = ?').get(projectId, taskId);
    if (!row) throw new NotFoundException(`Timeline task ${taskId} not found`);
    return row;
  }

  private worldRuleToResponse(row: any, events: any[], tasks: any[], focusChapter: any | null) {
    const latestEvents = events.filter(e => e.rule_id === row.id).map(e => ({
      id: e.id, chapterId: e.chapter_id, eventType: e.event_type, summary: e.summary || '',
      evidence: e.evidence || '', impact: e.impact || '', reviewStatus: e.review_status,
      source: e.source, updatedAt: e.updated_at,
    }));
    const focusTasks = tasks.filter(t => t.rule_id === row.id && (!focusChapter || t.chapter_id === focusChapter.id)).map(t => this.worldRuleTaskToResponse(t));
    return {
      id: row.id, title: row.title, ruleType: row.rule_type, scope: row.scope,
      volumeIndex: row.volume_index, content: row.content || '', explanation: row.explanation || '',
      limitation: row.limitation || '', contradictionRisk: row.contradiction_risk || '',
      status: row.status, riskLevel: row.risk_level || 'none',
      firstEstablishedChapterId: row.first_established_chapter_id || null,
      lastVerifiedChapterId: row.last_verified_chapter_id || null,
      relatedCharacterIds: parseJson(row.related_character_ids, []),
      relatedRelationshipIds: parseJson(row.related_relationship_ids, []),
      relatedForeshadowingIds: parseJson(row.related_foreshadowing_ids, []),
      relatedTimelineEventIds: parseJson(row.related_timeline_event_ids, []),
      reviewStatus: row.review_status, locked: Number(row.locked) === 1,
      source: row.source || 'manual', updatedAt: row.updated_at,
      latestEvents, focusTasks, legacy: false,
    };
  }

  private worldRuleTaskToResponse(task: any, rule?: any) {
    return {
      id: task.id, ruleId: task.rule_id, ruleTitle: rule?.title,
      chapterId: task.chapter_id, taskType: task.task_type, priority: task.priority,
      instruction: task.instruction || '', reason: task.reason || '',
      status: task.status, reviewStatus: task.review_status,
      source: task.source, locked: Number(task.locked) === 1,
      updatedAt: task.updated_at,
    };
  }

  private buildDerivedWorldRuleTasks(rules: any[], focusChapter: any | null, focusCharacterIds: Set<string>, focusRelationshipIds: Set<string>, focusForeshadowingIds?: Set<string>, focusTimelineEventIds?: Set<string>): any[] {
    if (!focusChapter) return [];
    const derived: any[] = [];
    for (const rule of rules) {
      const alreadyEvents = (rule.latestEvents || []).some((e: any) => e.chapterId === focusChapter.id);
      if (alreadyEvents) {
        derived.push({
          id: `world-radar-${rule.id}-event`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'check', priority: 'medium',
          instruction: `本章存在世界观规则事件：${rule.title}`,
          reason: 'world rule event 命中当前章', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (rule.firstEstablishedChapterId === focusChapter.id) {
        derived.push({
          id: `world-radar-${rule.id}-established`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'apply', priority: 'high',
          instruction: `本章首次建立世界观规则：${rule.title}`,
          reason: 'first_established_chapter_id 命中当前章', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (rule.lastVerifiedChapterId === focusChapter.id) {
        derived.push({
          id: `world-radar-${rule.id}-verified`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'verify', priority: 'medium',
          instruction: `本章验证世界观规则：${rule.title}`,
          reason: 'last_verified_chapter_id 命中当前章', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      const ruleChars = rule.relatedCharacterIds || [];
      if (ruleChars.some((c: string) => focusCharacterIds.has(c))) {
        derived.push({
          id: `world-radar-${rule.id}-char`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'check', priority: 'medium',
          instruction: `当前章人物关联世界观规则：${rule.title}`,
          reason: 'related_character_ids 与当前章人物相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      const ruleRels = rule.relatedRelationshipIds || [];
      if (ruleRels.some((r: string) => focusRelationshipIds.has(r))) {
        derived.push({
          id: `world-radar-${rule.id}-rel`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'check', priority: 'medium',
          instruction: `当前章关系关联世界观规则：${rule.title}`,
          reason: 'related_relationship_ids 与当前章关系相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      const ruleForeshadowings = rule.relatedForeshadowingIds || [];
      if (focusForeshadowingIds && ruleForeshadowings.some((f: string) => focusForeshadowingIds.has(f))) {
        derived.push({
          id: `world-radar-${rule.id}-foreshadowing`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'check', priority: 'medium',
          instruction: `当前章伏笔关联世界观规则：${rule.title}`,
          reason: 'related_foreshadowing_ids 与当前章伏笔相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      const ruleTimelineEvents = rule.relatedTimelineEventIds || [];
      if (focusTimelineEventIds && ruleTimelineEvents.some((t: string) => focusTimelineEventIds.has(t))) {
        derived.push({
          id: `world-radar-${rule.id}-timeline`,
          ruleId: rule.id, ruleTitle: rule.title, chapterId: focusChapter.id,
          taskType: 'check', priority: 'medium',
          instruction: `当前章时间线事件关联世界观规则：${rule.title}`,
          reason: 'related_timeline_event_ids 与当前章时间线事件相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
    }
    return derived;
  }

  private timelineEventToResponse(row: any, links: any[], tasks: any[], characters: any[], focusChapter: any | null) {
    const incomingLinks = links.filter(l => l.target_event_id === row.id).map(l => this.timelineLinkToResponse(l));
    const outgoingLinks = links.filter(l => l.source_event_id === row.id).map(l => this.timelineLinkToResponse(l));
    const focusTasks = tasks.filter(t => t.event_id === row.id && (!focusChapter || t.chapter_id === focusChapter.id)).map(t => this.timelineTaskToResponse(t));
    const participants = (row.participants_character_ids ? parseJson(row.participants_character_ids, []) : []).map((id: string) => {
      const ch = characters.find(c => c.id === id);
      return ch ? { id: ch.id, name: ch.name } : { id, name: null };
    });
    return {
      id: row.id, title: row.title, summary: row.summary || '', lineType: row.line_type,
      chapterId: row.chapter_id || null, volumeIndex: row.volume_index, chapterIndex: row.chapter_index,
      storyTimeText: row.story_time_text || '', storyTimeOrder: Number(row.story_time_order || 0),
      narrativeOrder: Number(row.narrative_order || 0), causalityOrder: Number(row.causality_order || 0),
      location: row.location || '',
      participantsCharacterIds: parseJson(row.participants_character_ids, []),
      participants,
      relatedRelationshipIds: parseJson(row.related_relationship_ids, []),
      relatedForeshadowingIds: parseJson(row.related_foreshadowing_ids, []),
      relatedWorldRuleIds: parseJson(row.related_world_rule_ids, []),
      readerKnownState: row.reader_known_state || 'unknown',
      characterKnownState: row.character_known_state || 'unknown',
      status: row.status, riskLevel: row.risk_level || 'none', riskReason: row.risk_reason || '',
      reviewStatus: row.review_status, locked: Number(row.locked) === 1,
      source: row.source || 'manual', updatedAt: row.updated_at,
      incomingLinks, outgoingLinks, focusTasks, legacy: false,
    };
  }

  private timelineLinkToResponse(row: any) {
    return {
      id: row.id, sourceEventId: row.source_event_id, targetEventId: row.target_event_id,
      linkType: row.link_type, summary: row.summary || '', evidence: row.evidence || '',
      riskLevel: row.risk_level || 'none', riskReason: row.risk_reason || '',
      reviewStatus: row.review_status, locked: Number(row.locked) === 1,
      source: row.source || 'manual', updatedAt: row.updated_at,
    };
  }

  private timelineTaskToResponse(task: any, event?: any) {
    return {
      id: task.id, eventId: task.event_id, eventTitle: event?.title,
      chapterId: task.chapter_id, taskType: task.task_type, priority: task.priority,
      instruction: task.instruction || '', reason: task.reason || '',
      status: task.status, reviewStatus: task.review_status,
      source: task.source, locked: Number(task.locked) === 1,
      updatedAt: task.updated_at,
    };
  }

  private legacyTimelineToResponse(row: any, focusChapter: any | null, currentChapterIndex: number) {
    return {
      id: `legacy-${row.id}`, title: row.title || 'legacy timeline event',
      summary: row.description || '', lineType: 'story_time',
      chapterId: focusChapter?.id, storyTimeText: row.event_date || '',
      storyTimeOrder: currentChapterIndex, status: row.status || 'planned',
      riskLevel: 'none', reviewStatus: 'pending', locked: false,
      source: 'legacy_import', updatedAt: row.updated_at,
      relatedCharacterIds: [],
      relatedRelationshipIds: [],
      incomingLinks: [], outgoingLinks: [], focusTasks: [], legacy: true,
    };
  }

  private buildDerivedTimelineTasks(events: any[], focusChapter: any | null, focusCharacterIds: Set<string>, focusRelationshipIds: Set<string>, currentChapterIndex: number, focusForeshadowingIds?: Set<string>, focusWorldRuleIds?: Set<string>, currentChapterOrder?: number): any[] {
    if (!focusChapter) return [];
    const derived: any[] = [];
    for (const event of events) {
      if (event.chapterId === focusChapter.id) {
        derived.push({
          id: `timeline-radar-${event.id}-chapter`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'check_order', priority: 'medium',
          instruction: `当前章存在时间线事件：${event.title}`,
          reason: 'chapter_id 命中当前章', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (event.narrativeOrder === currentChapterIndex) {
        derived.push({
          id: `timeline-radar-${event.id}-narrative`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'check_order', priority: 'medium',
          instruction: `当前章叙事顺序对应时间线事件：${event.title}`,
          reason: 'narrative_order 对应当前章节', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      const eventChars = event.participantsCharacterIds || [];
      if (eventChars.some((c: string) => focusCharacterIds.has(c))) {
        derived.push({
          id: `timeline-radar-${event.id}-char`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'check_order', priority: 'medium',
          instruction: `当前章人物参与时间线事件：${event.title}`,
          reason: 'participants_character_ids 与当前章人物相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (currentChapterOrder && currentChapterOrder > 0 && Math.abs(Number(event.storyTimeOrder || 0) - currentChapterOrder) <= 1) {
        derived.push({
          id: `timeline-radar-${event.id}-storytime`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'check_order', priority: 'medium',
          instruction: `当前章与客观故事时间相邻的事件：${event.title}`,
          reason: 'story_time_order 与当前章相邻', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (focusForeshadowingIds && (event.relatedForeshadowingIds || []).some((f: string) => focusForeshadowingIds.has(f))) {
        derived.push({
          id: `timeline-radar-${event.id}-foreshadow`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'sync_lines', priority: 'medium',
          instruction: `当前章伏笔关联时间线事件：${event.title}`,
          reason: 'related_foreshadowing_ids 与当前章伏笔相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
      if (focusWorldRuleIds && (event.relatedWorldRuleIds || []).some((w: string) => focusWorldRuleIds.has(w))) {
        derived.push({
          id: `timeline-radar-${event.id}-worldrule`,
          eventId: event.id, eventTitle: event.title, chapterId: focusChapter.id,
          taskType: 'sync_lines', priority: 'medium',
          instruction: `当前章世界观规则关联时间线事件：${event.title}`,
          reason: 'related_world_rule_ids 与当前章规则相交', status: 'todo', reviewStatus: 'pending',
          source: 'radar_derived', locked: false, derived: true,
        });
      }
    }
    return derived;
  }

  private characterToResponse(character: any, snapshots: any[], relationships: any[], focusChapter: any | null) {
    const charSnapshots = snapshots.filter(s => s.character_id === character.id);
    const latestSnapshots = charSnapshots.map(s => this.stateToResponse(s));
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
      riskTags: Array.from(new Set(riskTags)),
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
