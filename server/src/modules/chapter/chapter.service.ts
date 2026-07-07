/**
 * 章节 Service
 */
import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import type { ChapterRow } from '../../database/repositories/chapter.repository';
import type { CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';
import { StateItemService } from '../../state/state-item.service';

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
}

@Injectable()
export class ChapterService {
  constructor(
    private readonly repo: ChapterRepository,
    private readonly versionRepo: VersionHistoryRepository,
    @Optional() private readonly stateItemService?: StateItemService,
  ) {}

  create(projectId: string, dto: CreateChapterDto): ChapterResponse {
    const now = new Date().toISOString();
    const id = uuid();

    const existing = this.repo.findByVolumeChapter(projectId, dto.volumeIndex, dto.chapterIndex);
    if (existing) throw new BadRequestException(`Chapter ${dto.volumeIndex}-${dto.chapterIndex} already exists`);

    this.repo.insert({
      id,
      project_id: projectId,
      outline_id: dto.outlineId || null,
      volume_index: dto.volumeIndex,
      chapter_index: dto.chapterIndex,
      title: dto.title,
      content: dto.content || '',
      word_count: 0,
      status: 'draft',
      tianlong_8steps: null,
      model_config: null,
      hook_type: null,
      transition_mode: null,
      transition_context: null,
      authors_notes: null,
      quality_score: null,
      checksum: null,
      file_path: null,
      created_at: now,
      updated_at: now,
      locked_at: null,
    });

    return this.toResponse(this.repo.findById(id)!);
  }

  findByProjectId(projectId: string): ChapterListItem[] {
    return this.repo.findByProjectId(projectId).map((r) => ({
      id: r.id,
      volumeIndex: r.volume_index,
      chapterIndex: r.chapter_index,
      title: r.title,
      wordCount: r.word_count,
      status: r.status,
      updatedAt: r.updated_at,
    }));
  }

  findOne(id: string): ChapterResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`Chapter ${id} not found`);
    return this.toResponse(row);
  }

  update(id: string, dto: UpdateChapterDto): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);

    if (existing.status === 'locked') {
      throw new BadRequestException('Cannot modify locked chapter');
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (dto.title !== undefined) updateData.title = dto.title;
    const contentChanged = dto.content !== undefined && dto.content !== existing.content;
    if (dto.content !== undefined) {
      updateData.content = dto.content;
      // 计算字数 (中文字符 + 英文单词)
      const chineseChars = (dto.content.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
      const englishWords = dto.content.replace(/[^\x00-\xff]/g, '').split(/\s+/).filter(w => w.length > 0).length;
      updateData.word_count = chineseChars + englishWords;
    }
    if (dto.hookType !== undefined) updateData.hook_type = dto.hookType;
    if (dto.transitionMode !== undefined) updateData.transition_mode = dto.transitionMode;

    this.repo.update(id, updateData);
    const response = this.toResponse(this.repo.findById(id)!);
    if (contentChanged && this.stateItemService) {
      try {
        response.stateSync = this.stateItemService.createFromManualChapterEdit(
          existing.project_id,
          id,
          existing.content || '',
          dto.content || '',
        );
      } catch (error) {
        response.stateSync = {
          warning: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return response;
  }

  remove(id: string): { success: boolean } {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    this.repo.delete(id);
    return { success: true };
  }

  /**
   * 提交审核 (draft → reviewing)
   */
  submitForReview(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft chapters can be submitted for review');

    const row = this.repo.submitForReview(id);
    return this.toResponse(row!);
  }

  /**
   * 锁定章节 (reviewing → locked)
   */
  lock(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'reviewing') throw new BadRequestException('Only reviewing chapters can be locked');

    // 保存版本历史
    const version = this.versionRepo.getLatestVersion('chapter', id) + 1;
    this.versionRepo.insert({
      id: uuid(),
      entity_type: 'chapter',
      entity_id: id,
      version,
      snapshot: existing.content,
      checksum: null,
      change_summary: 'Chapter locked',
      created_by: 'system',
      created_at: new Date().toISOString(),
    });

    const row = this.repo.lockChapter(id);
    return this.toResponse(row!);
  }

  /**
   * 解锁章节 (locked → draft)
   */
  unlock(id: string): ChapterResponse {
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    if (existing.status !== 'locked') throw new BadRequestException('Only locked chapters can be unlocked');

    const row = this.repo.unlockChapter(id);
    return this.toResponse(row!);
  }

  /**
   * 获取版本历史
   */
  getVersionHistory(id: string): any[] {
    return this.versionRepo.getVersions('chapter', id).map((v) => ({
      id: v.id,
      version: v.version,
      snapshot: v.snapshot,
      checksum: v.checksum,
      changeSummary: v.change_summary,
      createdBy: v.created_by,
      createdAt: v.created_at,
    }));
  }

  /**
   * 恢复特定版本
   */
  restoreVersion(id: string, version: number): ChapterResponse {
    const versionRecord = this.versionRepo.getVersion('chapter', id, version);
    if (!versionRecord) throw new NotFoundException(`Version ${version} not found`);

    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);

    this.repo.updateContent(id, versionRecord.snapshot, existing.word_count);

    return this.toResponse(this.repo.findById(id)!);
  }

  /**
   * 获取卷列表
   */
  getVolumes(projectId: string): { volumeIndex: number; chapters: ChapterListItem[] }[] {
    const all = this.repo.findByProjectId(projectId);
    const volumeMap = new Map<number, ChapterListItem[]>();

    for (const row of all) {
      const list = volumeMap.get(row.volume_index) || [];
      list.push({
        id: row.id,
        volumeIndex: row.volume_index,
        chapterIndex: row.chapter_index,
        title: row.title,
        wordCount: row.word_count,
        status: row.status,
        updatedAt: row.updated_at,
      });
      volumeMap.set(row.volume_index, list);
    }

    return Array.from(volumeMap.entries())
      .map(([volumeIndex, chapters]) => ({ volumeIndex, chapters }))
      .sort((a, b) => a.volumeIndex - b.volumeIndex);
  }

  private toResponse(row: ChapterRow): ChapterResponse {
    return {
      id: row.id,
      projectId: row.project_id,
      outlineId: row.outline_id || undefined,
      volumeIndex: row.volume_index,
      chapterIndex: row.chapter_index,
      title: row.title,
      content: row.content,
      wordCount: row.word_count,
      status: row.status,
      tianlong8Steps: row.tianlong_8steps ? JSON.parse(row.tianlong_8steps) : undefined,
      modelConfig: row.model_config ? JSON.parse(row.model_config) : undefined,
      hookType: row.hook_type || undefined,
      transitionMode: row.transition_mode || undefined,
      transitionContext: row.transition_context ? JSON.parse(row.transition_context) : undefined,
      qualityScore: row.quality_score ? JSON.parse(row.quality_score) : undefined,
      checksum: row.checksum || undefined,
      filePath: row.file_path || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lockedAt: row.locked_at || undefined,
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
