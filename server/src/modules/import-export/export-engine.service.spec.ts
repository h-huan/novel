/**
 * ExportEngineService 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExportEngineService, type ExportChapter } from './export-engine.service';
import { ExportFormat } from './dto/import-export.dto';

describe('ExportEngineService', () => {
  let service: ExportEngineService;

  const mockChapters: ExportChapter[] = [
    { index: 1, title: '第一章 初入江湖', content: '青山绿水间，一位少年独行。', wordCount: 15 },
    { index: 2, title: '第二章 遇险', content: '林间忽然杀出一伙山贼。少年拔剑迎战。', wordCount: 22 },
  ];

  beforeEach(() => {
    service = new ExportEngineService();
  });

  describe('exportToFormat - Markdown', () => {
    it('should export markdown format', () => {
      const result = service.exportToFormat('测试作品', mockChapters, ExportFormat.MARKDOWN);
      expect(result.format).toBe(ExportFormat.MARKDOWN);
      expect(result.fileName).toBe('测试作品.md');
      expect(result.content).toContain('# 测试作品');
      expect(result.content).toContain('## 第一章 初入江湖');
      expect(result.content).toContain('## 第二章 遇险');
    });

    it('should have correct mime type', () => {
      const result = service.exportToFormat('Test', mockChapters, ExportFormat.MARKDOWN);
      expect(result.mimeType).toBe('text/markdown');
    });
  });

  describe('exportToFormat - TXT', () => {
    it('should export plain text format', () => {
      const result = service.exportToFormat('测试作品', mockChapters, ExportFormat.TXT);
      expect(result.format).toBe(ExportFormat.TXT);
      expect(result.fileName).toBe('测试作品.txt');
      expect(result.content).toContain('第一章 初入江湖');
      expect(result.content).toContain('第二章 遇险');
    });
  });

  describe('exportToFormat - EPUB', () => {
    it('should export epub (xhtml) format', () => {
      const result = service.exportToFormat('测试作品', mockChapters, ExportFormat.EPUB);
      expect(result.format).toBe(ExportFormat.EPUB);
      expect(result.content).toContain('<?xml version="1.0"');
      expect(result.content).toContain('<html xmlns');
      expect(result.content).toContain('测试作品');
    });

    it('should contain TOC navigation', () => {
      const result = service.exportToFormat('测试', mockChapters, ExportFormat.EPUB);
      expect(result.content).toContain('epub:type="toc"');
    });
  });

  describe('exportToFormat - HTML', () => {
    it('should export html format', () => {
      const result = service.exportToFormat('测试作品', mockChapters, ExportFormat.HTML);
      expect(result.format).toBe(ExportFormat.HTML);
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('<html lang="zh-CN">');
      expect(result.content).toContain('测试作品');
    });

    it('should include style tags', () => {
      const result = service.exportToFormat('Test', mockChapters, ExportFormat.HTML);
      expect(result.content).toContain('<style>');
    });
  });

  describe('generatePreview', () => {
    it('should generate preview data', () => {
      const preview = service.generatePreview('测试作品', mockChapters, ExportFormat.MARKDOWN);
      expect(preview.fileName).toBe('测试作品.md');
      expect(preview.format).toBe(ExportFormat.MARKDOWN);
      expect(preview.wordCount).toBeGreaterThan(0);
      expect(preview.chapterCount).toBe(2);
      expect(preview.snippet).toBeTruthy();
      expect(preview.estimatedSize).toMatch(/KB|MB/);
    });
  });
});
