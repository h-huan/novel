/**
 * 内存缓存服务 (LRU)
 * Layer 1: 内存缓存层 - 缓存热数据 (最近20章、10个角色)
 */
import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  key: string;
}

@Injectable()
export class MemoryCacheService {
  /** 章节缓存 (最多20条) */
  private readonly chapterCache: LRUCache<any>;
  /** 角色缓存 (最多10条) */
  private readonly characterCache: LRUCache<any>;
  /** 通用缓存 (最多50条, 用于其他热数据) */
  private readonly genericCache: LRUCache<any>;

  constructor() {
    this.chapterCache = new LRUCache<any>(20);
    this.characterCache = new LRUCache<any>(10);
    this.genericCache = new LRUCache<any>(50);
  }

  // ==================== 章节缓存 ====================

  getChapter<T>(key: string): T | undefined {
    return this.chapterCache.get(key) as T | undefined;
  }

  setChapter<T>(key: string, value: T): void {
    this.chapterCache.set(key, value);
  }

  hasChapter(key: string): boolean {
    return this.chapterCache.has(key);
  }

  removeChapter(key: string): boolean {
    return this.chapterCache.delete(key);
  }

  clearChapters(): void {
    this.chapterCache.clear();
  }

  getChapterKeys(): string[] {
    return this.chapterCache.keys();
  }

  getChapterCount(): number {
    return this.chapterCache.size();
  }

  // ==================== 角色缓存 ====================

  getCharacter<T>(key: string): T | undefined {
    return this.characterCache.get(key) as T | undefined;
  }

  setCharacter<T>(key: string, value: T): void {
    this.characterCache.set(key, value);
  }

  hasCharacter(key: string): boolean {
    return this.characterCache.has(key);
  }

  removeCharacter(key: string): boolean {
    return this.characterCache.delete(key);
  }

  clearCharacters(): void {
    this.characterCache.clear();
  }

  getCharacterKeys(): string[] {
    return this.characterCache.keys();
  }

  getCharacterCount(): number {
    return this.characterCache.size();
  }

  // ==================== 通用缓存 ====================

  get<T>(key: string): T | undefined {
    return this.genericCache.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.genericCache.set(key, value);
  }

  has(key: string): boolean {
    return this.genericCache.has(key);
  }

  remove(key: string): boolean {
    return this.genericCache.delete(key);
  }

  clear(): void {
    this.genericCache.clear();
  }

  // ==================== 缓存统计 ====================

  getStats() {
    return {
      chapterCache: {
        size: this.chapterCache.size(),
        capacity: 20,
        keys: this.chapterCache.keys(),
      },
      characterCache: {
        size: this.characterCache.size(),
        capacity: 10,
        keys: this.characterCache.keys(),
      },
      genericCache: {
        size: this.genericCache.size(),
        capacity: 50,
      },
    };
  }

  /**
   * 使与项目相关的所有缓存失效
   */
  invalidateProject(projectId: string): void {
    const chapterKeys = this.chapterCache.keys().filter(k => k.startsWith(projectId));
    for (const key of chapterKeys) {
      this.chapterCache.delete(key);
    }
    const characterKeys = this.characterCache.keys().filter(k => k.startsWith(projectId));
    for (const key of characterKeys) {
      this.characterCache.delete(key);
    }
  }

  /**
   * 使指定章节的缓存失效
   */
  invalidateChapter(projectId: string, chapterId: string): void {
    this.chapterCache.delete(`${projectId}:chapter:${chapterId}`);
    this.chapterCache.delete(`${projectId}:chapters`);
  }

  /**
   * 使指定角色的缓存失效
   */
  invalidateCharacter(projectId: string, characterId: string): void {
    this.characterCache.delete(`${projectId}:character:${characterId}`);
    this.characterCache.delete(`${projectId}:characters`);
  }
}

/**
 * 简单 LRU 缓存实现
 * 最近最少使用淘汰策略
 */
class LRUCache<T> {
  private readonly capacity: number;
  private cache: Map<string, CacheEntry<T>>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map<string, CacheEntry<T>>();
  }

  /**
   * 获取缓存条目 (同时将其标记为最近使用)
   */
  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined;

    const entry = this.cache.get(key)!;
    // 重新插入以更新顺序 (最近使用的在最后)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * 设置缓存条目
   */
  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // 删除最久未使用的条目 (Map 的第一个)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { value, key });
  }

  /**
   * 检查 key 是否存在 (不影响顺序)
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除条目
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取所有 key
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取当前大小
   */
  size(): number {
    return this.cache.size;
  }
}
