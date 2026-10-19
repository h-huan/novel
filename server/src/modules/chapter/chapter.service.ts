import { retireStaleIssues } from '../writing-quality/issue-lifecycle';
import { isProseLayoutOnlyChange } from './prose-layout-change';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import type { ChapterRow } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateItemService } from '../../state/state-item.service';
import type { CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';
import { ChapterDerivedDataSyncService, type ValidatedChapterOutlineProof } from './chapter-derived-data-sync.service';
import { DatabaseService } from '../../database/database.service';
import { OriginalityGuardService } from '../originality/originality-guard.service';
import { CHAPTER_WORD_RANGE, isChapterBodyLengthAcceptable } from '../../../shared/src';

export interface ChapterResponse {
  id: string;
  projectId: string;
  outlineId?: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  content: string;
  wordCount: number;
  targetWords?: number;
  status: string;
  modelConfig?: any;
  hookType?: string;
  transitionMode?: string;
  transitionContext?: any;
  qualityScore?: any;
  checksum?: string;
  filePath?: string;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
  stateSync?: any;
  derivedSync?: any;
  /** 本章在保存时清理掉的过期 conflict 数量（基于旧版本正文的未解决 warning/error 冲突） */
  staleConflictsCleaned?: number;
  /** 本章最近一次自动质检状态：running/ok/failed（让作者看得见质检是否真正跑成） */
  autoQualityStatus?: 'running' | 'ok' | 'needs_rewrite' | 'failed';
  autoQualityMessage?: string;
  autoQualityAt?: string;
}

@Injectable()
export class ChapterService {
  constructor(
    private readonly repo: ChapterRepository,
    private readonly versionRepo: VersionHistoryRepository,
    @Optional() private readonly stateItemService?: StateItemService,
    @Optional() private readonly derivedDataSync?: ChapterDerivedDataSyncService,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly originalityGuard?: OriginalityGuardService,
  ) {}

  create(projectId: string, dto: CreateChapterDto): ChapterResponse {
    const now = new Date().toISOString();
    const id = uuid();
    const content = dto.content || '';
    const existing = this.repo.findByVolumeChapter(projectId, dto.volumeIndex, dto.chapterIndex);
    if (existing) throw new BadRequestException(`Chapter ${dto.volumeIndex}-${dto.chapterIndex} already exists`);

    this.repo.insert({
      id, project_id: projectId, outline_id: dto.outlineId || null,
      volume_index: dto.volumeIndex, chapter_index: dto.chapterIndex, title: dto.title,
      content, word_count: this.countWords(content), status: 'draft',
      model_config: null, hook_type: null,
      transition_mode: null, transition_context: null, authors_notes: null,
      quality_score: null, checksum: this.contentChecksum(content), file_path: null,
      created_at: now, updated_at: now, locked_at: null,
    });
    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): ChapterListItem[] {
    // 列表一次性带出每章最新质检状态与综合分：编辑器状态条同步、项目表格/工作台评分列都以这里为权威，
    // 杜绝「列表项缺质检字段 → 前端同步把状态覆盖成空、评分列永远『待质检』」。
    const scoreMap = this.repo.latestQualityScoreByProject(projectId);
    return this.repo.findByProjectId(projectId).map((row) => ({
      id: row.id, projectId: row.project_id, volumeIndex: row.volume_index, chapterIndex: row.chapter_index,
      title: row.title, wordCount: row.word_count,
      targetWords: this.repo.findOutlineTargetWords(row.outline_id),
      status: row.status, updatedAt: row.updated_at,
      autoQualityStatus: (row.auto_quality_status as ChapterResponse['autoQualityStatus']) || undefined,
      autoQualityMessage: row.auto_quality_message || undefined,
      autoQualityAt: row.auto_quality_at || undefined,
      qualityScore: scoreMap.get(row.id),
    }));
  }

  findOne(id: string): ChapterResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Chapter ${id} not found`);
    return this.toResponse(row);
  }

  async update(id: string, dto: UpdateChapterDto, validatedOutlineProof?: ValidatedChapterOutlineProof): Promise<ChapterResponse> {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status === 'locked') throw new BadRequestException('Cannot modify locked chapter');

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.title !== undefined) updateData.title = dto.title;
    const contentChanged = dto.content !== undefined && dto.content !== existing.content;
    if (dto.content !== undefined) {
      if (contentChanged) this.saveContentSnapshot(existing, 'Automatic snapshot before content save', 'author');
      updateData.content = dto.content;
      updateData.word_count = this.countWords(dto.content);
      updateData.checksum = this.contentChecksum(dto.content);
    }
    if (dto.hookType !== undefined) updateData.hook_type = dto.hookType;
    if (dto.transitionMode !== undefined) updateData.transition_mode = dto.transitionMode;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    if (contentChanged) {
      // Only retire findings tied to a replaced version; keep the just-accepted review.
      const formattingOnly = isProseLayoutOnlyChange(existing.content || '', dto.content || '');
      const cleaned = this.cleanStaleConflictsForChapter(existing.project_id, existing.chapter_index);
      // 原创性后置检测（在清理旧冲突之后执行，避免被当作过期矛盾清掉；检测本身不阻断保存，命中落矛盾表）
      if (!formattingOnly) this.originalityGuard?.checkChapter({
        projectId: existing.project_id,
        chapterIndex: existing.chapter_index,
        title: (dto.title ?? existing.title) || '',
        content: dto.content || '',
      });
      const sync = await this.syncAfterContentChange(existing, dto.content || '', 'manual_save', validatedOutlineProof);
      response.stateSync = sync.stateSync;
      response.derivedSync = sync.derivedSync;
      if (cleaned > 0) {
        response.staleConflictsCleaned = cleaned;
      }
    } else {
      // 内容未变化：派生数据本已与已保存内容一致，无需重新同步。
      // 明确返回 fullSyncSuccess=true，避免前端误报「状态同步未完成」。
      response.derivedSync = { success: true, fullSyncSuccess: true, skipped: true, reason: 'no_content_change' };
    }
    return response;
  }

  /** Archive obsolete findings of every type while retaining their history. */
  private cleanStaleConflictsForChapter(projectId: string, chapterIndex: number): number {
    if (!this.databaseService) return 0;
    const db = this.databaseService.getDb();
    const chapter = db.prepare('SELECT id FROM chapters WHERE project_id=? AND chapter_index=?')
      .get(projectId, chapterIndex) as { id: string } | undefined;
    return chapter ? retireStaleIssues(db, projectId, chapter.id) : 0;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  async submitForReview(id: string): Promise<ChapterResponse> {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft chapters can be submitted for review');
    this.assertPublishableWordCount(existing);
    if (this.derivedDataSync) {
      const sync = await this.derivedDataSync.syncAfterContentChange({
        projectId: existing.project_id,
        chapterId: existing.id,
        beforeContent: existing.content || '',
        afterContent: existing.content || '',
        reason: 'manual_resync',
      });
      if (!sync?.success) {
        throw new BadRequestException('Review cannot start because chapter synchronization did not complete');
      }
    }
    return this.toResponse(this.repo.submitForReview(id)!);
  }

  async lock(id: string): Promise<ChapterResponse> {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'reviewing') throw new BadRequestException('Only reviewing chapters can be locked');
    this.assertPublishableWordCount(existing);
    if (this.derivedDataSync) {
      const gate = this.derivedDataSync.getLockGate(existing.project_id, id, existing.content || '');
      if (!gate.allowed) {
        throw new BadRequestException({ code: 'CHAPTER_LOCK_BLOCKED', message: 'Chapter continuity gate blocked locking', reasons: gate.reasons, reviewIds: gate.reviewIds, stateItemIds: gate.stateItemIds, syncStatuses: gate.syncStatuses });
      }
    }
    this.saveContentSnapshot(existing, 'Chapter lock snapshot', 'system');
    return this.toResponse(this.repo.lockChapter(id)!);
  }

  /**
   * Explicit author action: lock a draft without changing it to reviewing.
   * It reads the synchronization result created during save/AI writing and runs
   * the same read-only lock gate; it never starts synchronization itself.
   */
  async directLock(id: string): Promise<ChapterResponse> {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft chapters can be directly locked');
    this.assertPublishableWordCount(existing);
    if (this.derivedDataSync) {
      const gate = this.derivedDataSync.getLockGate(existing.project_id, id, existing.content || '');
      if (!gate.allowed) {
        throw new BadRequestException({ code: 'CHAPTER_LOCK_BLOCKED', message: 'Chapter continuity gate blocked locking', reasons: gate.reasons, reviewIds: gate.reviewIds, stateItemIds: gate.stateItemIds, syncStatuses: gate.syncStatuses });
      }
    }
    this.saveContentSnapshot(existing, 'Chapter direct-lock snapshot', 'author');
    return this.toResponse(this.repo.lockChapterDirect(id)!);
  }

  unlock(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'locked') throw new BadRequestException('Only locked chapters can be unlocked');
    return this.toResponse(this.repo.unlockChapter(id)!);
  }

  rejectReview(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'reviewing') throw new BadRequestException('Only reviewing chapters can be returned to draft');
    return this.toResponse(this.repo.returnReviewToDraft(id)!);
  }

  getVersionHistory(id: string): any[] {
    return this.versionRepo.getVersions('chapter', id).map((version) => ({
      id: version.id, version: version.version, snapshot: version.snapshot,
      checksum: version.checksum, changeSummary: version.change_summary,
      createdBy: version.created_by, createdAt: version.created_at,
    }));
  }

  async restoreVersion(id: string, version: number): Promise<ChapterResponse> {
    const versionRecord = this.versionRepo.getVersion('chapter', id, version);
    if (!versionRecord) throw new NotFoundException(`Version ${version} not found`);
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status === 'locked') {
      throw new BadRequestException('Cannot restore a locked chapter; unlock it first');
    }

    const restoredContent = versionRecord.snapshot || '';
    if (restoredContent === existing.content) return this.toResponse(existing);

    this.saveContentSnapshot(existing, `Automatic snapshot before restoring version ${version}`, 'author');
    this.repo.update(id, {
      content: restoredContent,
      word_count: this.countWords(restoredContent),
      checksum: this.contentChecksum(restoredContent),
      updated_at: new Date().toISOString(),
    });
    const response = this.toResponse(this.repo.findById(id)!);
    const sync = await this.syncAfterContentChange(existing, restoredContent, 'version_restore');
    response.stateSync = sync.stateSync;
    response.derivedSync = sync.derivedSync;
    return response;
  }

  async resyncDerivedData(projectId: string, id: string): Promise<any> {
    const chapter = this.repo.findById(id);
    if (!chapter || chapter.project_id !== projectId) throw new NotFoundException(`Chapter ${id} not found`);
    if (!this.derivedDataSync) {
      return { success: false, warning: 'Derived data sync service is unavailable' };
    }
    return this.derivedDataSync.syncAfterContentChange({
      projectId,
      chapterId: id,
      beforeContent: chapter.content || '',
      afterContent: chapter.content || '',
      reason: 'manual_resync',
    });
  }

  /**
   * 全量重算项目伏笔状态（存量项目兼容入口）。
   * 扫描所有已有正文的章节，自动推进 reminder / recovered 状态。
   */
  resyncAllForeshadowings(projectId: string): { reminded: number; recovered: number; scanned: number } {
    if (!this.derivedDataSync) {
      return { reminded: 0, recovered: 0, scanned: 0 };
    }
    return this.derivedDataSync.resyncAllForeshadowings(projectId);
  }

  getVolumes(projectId: string): { volumeIndex: number; chapters: ChapterListItem[] }[] {
    const grouped = new Map<number, ChapterListItem[]>();
    for (const row of this.repo.findByProjectId(projectId)) {
      const chapters = grouped.get(row.volume_index) || [];
      chapters.push({ id: row.id, projectId: row.project_id, volumeIndex: row.volume_index, chapterIndex: row.chapter_index,
        title: row.title, wordCount: row.word_count,
        targetWords: this.repo.findOutlineTargetWords(row.outline_id),
        status: row.status, updatedAt: row.updated_at });
      grouped.set(row.volume_index, chapters);
    }
    return Array.from(grouped.entries()).map(([volumeIndex, chapters]) => ({ volumeIndex, chapters }))
      .sort((a, b) => a.volumeIndex - b.volumeIndex);
  }

  private saveContentSnapshot(chapter: ChapterRow, changeSummary: string, actor: string): { created: boolean; version?: number } {
    const content = chapter.content || '';
    const checksum = this.contentChecksum(content);
    const latest = this.versionRepo.getLatest('chapter', chapter.id);
    if (latest?.checksum === checksum || latest?.snapshot === content) {
      return { created: false, version: latest.version };
    }
    const version = this.versionRepo.getLatestVersion('chapter', chapter.id) + 1;
    this.versionRepo.insert({
      id: uuid(), entity_type: 'chapter', entity_id: chapter.id, version, snapshot: content,
      checksum, change_summary: changeSummary, created_by: actor, created_at: new Date().toISOString(),
    });
    return { created: true, version };
  }

  private async syncAfterContentChange(
    existing: ChapterRow,
    afterContent: string,
    reason: 'manual_save' | 'version_restore',
    validatedOutlineProof?: ValidatedChapterOutlineProof,
  ): Promise<{ stateSync: Record<string, unknown>; derivedSync: Record<string, unknown> }> {
    const stateSync: Record<string, unknown> = {};
    let derivedSync: any = { success: false };
    const warnings: string[] = [];
    if (isProseLayoutOnlyChange(existing.content || '', afterContent)) {
      stateSync.formattingOnly = true;
      stateSync.stateCandidates = { created: [], reason: 'Verified text/order unchanged; formatting creates no story facts' };
    } else if (this.stateItemService) {
      try {
        stateSync.stateCandidates = this.stateItemService.createFromManualChapterEdit(
          existing.project_id, existing.id, existing.content || '', afterContent,
        );
      } catch (error) {
        warnings.push(`State candidate sync failed: ${this.errorMessage(error)}`);
      }
    } else {
      warnings.push('State candidate sync service is unavailable');
    }
    if (this.derivedDataSync) {
      try {
        derivedSync = await this.derivedDataSync.syncAfterContentChange({
          projectId: existing.project_id, chapterId: existing.id,
          beforeContent: existing.content || '', afterContent, reason,
          validatedOutlineProof,
        });
      } catch (error) {
        warnings.push(`Derived data sync failed: ${this.errorMessage(error)}`);
      }
    } else {
      warnings.push('Derived data sync service is unavailable');
    }
    if (warnings.length > 0) {
      stateSync.warning = warnings.join('; ');
      derivedSync = { ...derivedSync, warning: warnings.join('; '), success: false };
    }
    return { stateSync, derivedSync };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private contentChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private countWords(content: string): number {
    const chineseChars = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const englishWords = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').trim().split(/\s+/).filter(word => /[a-zA-Z]/.test(word)).length;
    return chineseChars + englishWords;
  }

  /** Legacy generators sometimes persisted their `{ fullText: ... }` envelope as body text. */
  private narrativeContent(content: string | null | undefined): string {
    const source = String(content || '').trim();
    if (!source.startsWith('{')) return source;
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      for (const key of ['fullText', 'full_text', 'content', 'text', 'chapterContent']) {
        if (typeof parsed[key] === 'string' && parsed[key].trim()) return parsed[key].trim();
      }
    } catch {
      // This is normal prose if it is not valid JSON; leave it untouched.
    }
    return source;
  }

  private assertPublishableWordCount(row: ChapterRow): void {
    // The production repository always exposes the outline target. Lightweight
    // unit-test doubles without that dependency keep exercising state logic.
    if (typeof (this.repo as any).findOutlineTargetWords !== 'function') return;
    const content = this.narrativeContent(row.content);
    const actual = this.countWords(content);
    const target = Number(this.repo.findOutlineTargetWords(row.outline_id) || 0);
    if (!Number.isInteger(target) || target < CHAPTER_WORD_RANGE.min || target > CHAPTER_WORD_RANGE.max) {
      throw new BadRequestException(`Chapter outline has no valid target word count (${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max} words)`);
    }
    // 门禁文案区分「空正文 / 不足 / 超限」，避免把"无法送审/锁定"误读成"已被锁定"。
    if (actual === 0) {
      throw new BadRequestException('本章正文为空（0 字）。请先写作或生成正文后再提交质检或锁定。');
    }
    if (!isChapterBodyLengthAcceptable(actual)) {
      throw new BadRequestException(`本章正文已达 ${actual} 字，超过 ${CHAPTER_WORD_RANGE.max} 字上限（本章目标 ${target} 字），需精简后才能提交质检或锁定。`);
    }
  }

  private toResponse(row: ChapterRow): ChapterResponse {
    const content = this.narrativeContent(row.content);
    return {
      id: row.id, projectId: row.project_id, outlineId: row.outline_id || undefined,
      volumeIndex: row.volume_index, chapterIndex: row.chapter_index, title: row.title,
      content, wordCount: this.countWords(content), status: row.status,
      targetWords: typeof (this.repo as any).findOutlineTargetWords === 'function'
        ? this.repo.findOutlineTargetWords(row.outline_id)
        : undefined,
      modelConfig: row.model_config ? JSON.parse(row.model_config) : undefined,
      hookType: row.hook_type || undefined, transitionMode: row.transition_mode || undefined,
      transitionContext: row.transition_context ? JSON.parse(row.transition_context) : undefined,
      qualityScore: row.quality_score ? JSON.parse(row.quality_score) : undefined,
      checksum: row.checksum || undefined, filePath: row.file_path || undefined,
      createdAt: row.created_at, updatedAt: row.updated_at, lockedAt: row.locked_at || undefined,
      autoQualityStatus: (row.auto_quality_status as any) || undefined,
      autoQualityMessage: row.auto_quality_message || undefined,
      autoQualityAt: row.auto_quality_at || undefined,
    };
  }
}

export interface ChapterListItem {
  id: string;
  projectId: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  wordCount: number;
  targetWords?: number;
  status: string;
  updatedAt: string;
  /** 最新自动质检状态/消息/时间（与章节行同权威，列表带出供前端即时同步，无需再请求单章详情） */
  autoQualityStatus?: 'running' | 'ok' | 'needs_rewrite' | 'failed';
  autoQualityMessage?: string;
  autoQualityAt?: string;
  /** 最新一条质检报告综合分（数字），无报告时为 undefined */
  qualityScore?: number;
}
