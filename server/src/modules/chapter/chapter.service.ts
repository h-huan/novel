import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import type { ChapterRow } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateItemService } from '../../state/state-item.service';
import type { CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

export interface ChapterResponse {
  id: string;
  projectId: string;
  outlineId?: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  content: string;
  wordCount: number;
  status: string;
  tianlong8Steps?: any;
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
}

@Injectable()
export class ChapterService {
  constructor(
    private readonly repo: ChapterRepository,
    private readonly versionRepo: VersionHistoryRepository,
    @Optional() private readonly stateItemService?: StateItemService,
    @Optional() private readonly derivedDataSync?: ChapterDerivedDataSyncService,
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
      tianlong_8steps: null, model_config: null, hook_type: null,
      transition_mode: null, transition_context: null, authors_notes: null,
      quality_score: null, checksum: this.contentChecksum(content), file_path: null,
      created_at: now, updated_at: now, locked_at: null,
    });
    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): ChapterListItem[] {
    return this.repo.findByProjectId(projectId).map((row) => ({
      id: row.id, volumeIndex: row.volume_index, chapterIndex: row.chapter_index,
      title: row.title, wordCount: row.word_count, status: row.status, updatedAt: row.updated_at,
    }));
  }

  findOne(id: string): ChapterResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Chapter ${id} not found`);
    return this.toResponse(row);
  }

  async update(id: string, dto: UpdateChapterDto): Promise<ChapterResponse> {
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
      const sync = await this.syncAfterContentChange(existing, dto.content || '', 'manual_save');
      response.stateSync = sync.stateSync;
      response.derivedSync = sync.derivedSync;
    }
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  submitForReview(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft chapters can be submitted for review');
    return this.toResponse(this.repo.submitForReview(id)!);
  }

  lock(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'reviewing') throw new BadRequestException('Only reviewing chapters can be locked');
    this.saveContentSnapshot(existing, 'Chapter lock snapshot', 'system');
    return this.toResponse(this.repo.lockChapter(id)!);
  }

  unlock(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'locked') throw new BadRequestException('Only locked chapters can be unlocked');
    return this.toResponse(this.repo.unlockChapter(id)!);
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
      reason: 'manual_save',
    });
  }

  getVolumes(projectId: string): { volumeIndex: number; chapters: ChapterListItem[] }[] {
    const grouped = new Map<number, ChapterListItem[]>();
    for (const row of this.repo.findByProjectId(projectId)) {
      const chapters = grouped.get(row.volume_index) || [];
      chapters.push({ id: row.id, volumeIndex: row.volume_index, chapterIndex: row.chapter_index,
        title: row.title, wordCount: row.word_count, status: row.status, updatedAt: row.updated_at });
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
  ): Promise<{ stateSync: Record<string, unknown>; derivedSync: Record<string, unknown> }> {
    const stateSync: Record<string, unknown> = {};
    let derivedSync: any = { success: false };
    const warnings: string[] = [];
    if (this.stateItemService) {
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
    const chineseChars = (content.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const englishWords = content.replace(/[^\x00-\xff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    return chineseChars + englishWords;
  }

  private toResponse(row: ChapterRow): ChapterResponse {
    return {
      id: row.id, projectId: row.project_id, outlineId: row.outline_id || undefined,
      volumeIndex: row.volume_index, chapterIndex: row.chapter_index, title: row.title,
      content: row.content, wordCount: row.word_count, status: row.status,
      tianlong8Steps: row.tianlong_8steps ? JSON.parse(row.tianlong_8steps) : undefined,
      modelConfig: row.model_config ? JSON.parse(row.model_config) : undefined,
      hookType: row.hook_type || undefined, transitionMode: row.transition_mode || undefined,
      transitionContext: row.transition_context ? JSON.parse(row.transition_context) : undefined,
      qualityScore: row.quality_score ? JSON.parse(row.quality_score) : undefined,
      checksum: row.checksum || undefined, filePath: row.file_path || undefined,
      createdAt: row.created_at, updatedAt: row.updated_at, lockedAt: row.locked_at || undefined,
    };
  }
}

export interface ChapterListItem {
  id: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  wordCount: number;
  status: string;
  updatedAt: string;
}
