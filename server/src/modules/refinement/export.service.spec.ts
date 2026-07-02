/**
 * export.service.spec.ts
 * ExportService 单元测试 — 多格式导出
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;

  const sampleContent = '# 第一章\n\n这是第一章的内容。\n\n## 第一节\n\n这是第一节的内容。\n\n# 第二章\n\n这是第二章的内容。';

  beforeEach(() => {
    service = new ExportService();
  });

  describe('getSupportedFormats', () => {
    it('should return all supported formats', () => {
      const formats = service.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
    });

    it('each format should have id, name, mimeType', () => {
      const formats = service.getSupportedFormats();
      for (const f of formats) {
        expect(f).toHaveProperty('id');
        expect(f).toHaveProperty('name');
        expect(f).toHaveProperty('mimeType');
      }
    });
  });

  describe('exportMarkdown', () => {
    it('should prepend title and author as markdown', () => {
      const result = service.exportMarkdown(sampleContent, { title: '测试小说', author: '作者' });
      expect(result.format).toBe('markdown');
      expect(result.content).toContain('测试小说');
      expect(result.content).toContain('作者');
      expect(result.content).toContain(sampleContent);
    });
  });

  describe('exportTxt', () => {
    it('should strip markdown formatting', () => {
      const result = service.exportTxt(sampleContent);
      expect(result.format).toBe('txt');
      // Markdown headings should be gone - content should still exist
      expect(result.content).toContain('第一章');
      expect(result.content).not.toContain('# 第一章'); // heading markers removed
    });

    it('should remove bold markers', () => {
      const result = service.exportTxt('这是**加粗**文本');
      expect(result.content).not.toContain('**');
    });
  });

  describe('exportHtml', () => {
    it('should convert markdown to HTML', () => {
      const result = service.exportHtml(sampleContent);
      expect(result.format).toBe('html');
      expect(result.content).toContain('<h1>');
      expect(result.content).toContain('<p>');
      expect(result.content).toContain('</html>');
    });

    it('should embed CSS', () => {
      const result = service.exportHtml(sampleContent);
      expect(result.content).toContain('<style>');
    });

    it('should use custom CSS when provided', () => {
      const result = service.exportHtml(sampleContent, { css: 'body { color: red; }' });
      expect(result.content).toContain('color: red');
    });
  });

  describe('exportEpub', () => {
    it('should generate EPUB content structure', () => {
      const result = service.exportEpub(sampleContent);
      expect(result.format).toBe('epub');
      expect(result.content).toContain('container.xml');
      expect(result.content).toContain('content.opf');
      expect(result.content).toContain('.ncx');
    });

    it('should split content into chapters', () => {
      const result = service.exportEpub(sampleContent);
      expect(result.content).toContain('第一章');
      expect(result.content).toContain('第二章');
    });

    it('each result should have filename and mimeType', () => {
      const result = service.exportEpub(sampleContent);
      expect(result).toHaveProperty('filename');
      expect(result.filename).toContain('.epub');
      expect(result.mimeType).toContain('epub');
    });
  });

  describe('exportPdf', () => {
    it('should return HTML-based PDF placeholder', () => {
      const result = service.exportPdf(sampleContent);
      expect(result.format).toBe('pdf');
      expect(result.content).toBeDefined();
    });
  });

  describe('exportDocx', () => {
    it('should generate DOCX content with XML structure', () => {
      const result = service.exportDocx(sampleContent);
      expect(result.format).toBe('docx');
      expect(result.filename).toContain('.docx');
      expect(result.content).toContain('word/document.xml');
      expect(result.mimeType).toContain('wordprocessingml');
    });
  });

  describe('export', () => {
    it('should route to correct format', () => {
      const result = service.export(sampleContent, 'html');
      expect(result.format).toBe('html');
    });

    it('should throw for unsupported format', () => {
      expect(() => service.export(sampleContent, 'unknown')).toThrow();
    });
  });
});
