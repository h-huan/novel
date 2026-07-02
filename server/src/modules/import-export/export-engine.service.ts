/**
 * 导出引擎 Service
 * 支持导出 Markdown / TXT / EPUB(简化版) / HTML / .novel 包
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { ExportFormat } from './dto/import-export.dto';
import { DatabaseService } from '../../database/database.service';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');

export interface ExportChapter {
  title: string;
  content: string;
  wordCount: number;
  index: number;
}

export interface ExportResult {
  fileName: string;
  content: string;
  format: ExportFormat;
  wordCount: number;
  chapterCount: number;
  mimeType: string;
}

export interface ExportPreview {
  fileName: string;
  format: ExportFormat;
  wordCount: number;
  chapterCount: number;
  snippet: string;
  estimatedSize: string;
}

@Injectable()
export class ExportEngineService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly projectRepo: ProjectRepository,
    private readonly chapterRepo: ChapterRepository,
    private readonly characterRepo: CharacterRepository,
    private readonly worldSettingRepo: WorldSettingRepository,
    private readonly outlineRepo: OutlineRepository,
    private readonly foreshadowingRepo: ForeshadowingRepository,
  ) {}

  /**
   * 导出为指定格式
   */
  exportToFormat(
    projectTitle: string,
    chapters: ExportChapter[],
    format: ExportFormat,
  ): ExportResult {
    switch (format) {
      case ExportFormat.MARKDOWN:
        return this.exportMarkdown(projectTitle, chapters);
      case ExportFormat.TXT:
        return this.exportTxt(projectTitle, chapters);
      case ExportFormat.EPUB:
        return this.exportEpub(projectTitle, chapters);
      case ExportFormat.HTML:
        return this.exportHtml(projectTitle, chapters);
      case ExportFormat.DOCX:
        return this.exportDocx(projectTitle, chapters);
      default:
        throw new BadRequestException(`Unsupported export format: ${format}`);
    }
  }

  /**
   * 生成导出预览
   */
  generatePreview(
    projectTitle: string,
    chapters: ExportChapter[],
    format: ExportFormat,
  ): ExportPreview {
    const result = this.exportToFormat(projectTitle, chapters, format);
    const sizeInKB = Buffer.byteLength(result.content, 'utf-8') / 1024;
    const estimatedSize =
      sizeInKB < 1024
        ? `${sizeInKB.toFixed(1)} KB`
        : `${(sizeInKB / 1024).toFixed(1)} MB`;

    return {
      fileName: result.fileName,
      format: result.format,
      wordCount: result.wordCount,
      chapterCount: result.chapterCount,
      snippet: result.content.substring(0, 500) + '...',
      estimatedSize,
    };
  }

  // ==================== .novel 包导出 ====================

  /**
   * 导出 .novel 包 (ZIP格式)
   * 包含项目全部数据和元信息，使用 archiver 创建真正的 ZIP 文件（重命名为 .novel）
   */
  async exportNovelPackage(projectId: string): Promise<ExportResult> {
    const project = this.projectRepo.findById(projectId);
    if (!project) {
      throw new BadRequestException(`Project not found: ${projectId}`);
    }

    const chapters = this.chapterRepo.findByProjectId(projectId);
    const characters = this.characterRepo.findByProjectId(projectId);
    const worldSettings = this.worldSettingRepo.findByProjectId(projectId);
    const outlines = this.outlineRepo.findByProjectId(projectId);
    const foreshadowings = this.foreshadowingRepo.findByProjectId(projectId);

    const exportsDir = path.join(
      path.dirname(this.databaseService.dbPath),
      '..',
      'exports',
    );
    this.ensureDir(exportsDir);

    const fileName = `${project.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}.novel`;
    const outputPath = path.join(exportsDir, fileName);

    const totalWords = chapters.reduce((s: number, c: any) => s + (c.word_count || 0), 0);

    return new Promise<ExportResult>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        const manifest = {
          project: project.title,
          chapters: chapters.length,
          characters: characters.length,
          worldSettings: worldSettings.length,
          outlines: outlines.length,
          foreshadowings: foreshadowings.length,
          exportedAt: new Date().toISOString(),
        };

        resolve({
          fileName,
          content: JSON.stringify(manifest, null, 2),
          format: ExportFormat.NOVEL,
          wordCount: totalWords,
          chapterCount: chapters.length,
          mimeType: 'application/octet-stream',
        });
      });

      archive.on('error', (err: any) => reject(err));

      archive.pipe(output);

      // 1. project.json
      const projectJson = {
        id: project.id,
        title: project.title,
        type: project.type,
        status: project.status,
        target_words: project.target_words,
        current_words: project.current_words,
        platform_style: project.platform_style,
        description: project.description,
        writing_style: project.writing_style,
        settings: project.settings,
        created_at: project.created_at,
        updated_at: project.updated_at,
        exported_at: new Date().toISOString(),
        version: '1.0',
      };
      archive.append(JSON.stringify(projectJson, null, 2), { name: 'project.json' });

      // 2. chapters/chapter_001.md, chapter_002.md ...
      for (const ch of chapters) {
        const chapterContent = `# ${ch.title}\n\n${ch.content}\n`;
        const chapterFile = `chapters/chapter_${String(ch.chapter_index).padStart(3, '0')}.md`;
        archive.append(chapterContent, { name: chapterFile });
      }

      // 3. characters.json
      archive.append(JSON.stringify(characters, null, 2), { name: 'characters.json' });

      // 4. world.json
      archive.append(JSON.stringify(worldSettings, null, 2), { name: 'world.json' });

      // 5. outline.json
      archive.append(JSON.stringify(outlines, null, 2), { name: 'outline.json' });

      // 6. foreshadowing.json
      archive.append(JSON.stringify(foreshadowings, null, 2), { name: 'foreshadowing.json' });

      // 7. author_notes.json
      archive.append(JSON.stringify({ note: '' }, null, 2), { name: 'author_notes.json' });

      // 8. vectors/index.json (RAG 索引占位)
      archive.append(JSON.stringify({
        exportedAt: new Date().toISOString(),
        projectId,
        note: 'RAG vectors directory - populated during re-indexing',
        status: 'placeholder',
      }, null, 2), { name: 'vectors/index.json' });

      // 9. .metadata.json (导出版本、时间戳、字数)
      const metadata = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        word_count: totalWords,
        chapter_count: chapters.length,
        project_id: projectId,
        project_title: project.title,
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: '.metadata.json' });

      archive.finalize();
    });
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private exportMarkdown(projectTitle: string, chapters: ExportChapter[]): ExportResult {
    const lines: string[] = [];

    lines.push(`# ${projectTitle}`);
    lines.push('');
    lines.push(`> 导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push(`> 总字数: ${chapters.reduce((s, c) => s + c.wordCount, 0)}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const chapter of chapters) {
      lines.push(`## ${chapter.title}`);
      lines.push('');
      lines.push(chapter.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const content = lines.join('\n');
    return {
      fileName: `${projectTitle}.md`,
      content,
      format: ExportFormat.MARKDOWN,
      wordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
      chapterCount: chapters.length,
      mimeType: 'text/markdown',
    };
  }

  // ==================== TXT 导出 ====================

  private exportTxt(projectTitle: string, chapters: ExportChapter[]): ExportResult {
    const lines: string[] = [];

    lines.push(projectTitle);
    lines.push('='.repeat(projectTitle.length));
    lines.push('');
    lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push(`总字数: ${chapters.reduce((s, c) => s + c.wordCount, 0)}`);
    lines.push('');
    lines.push('');

    for (const chapter of chapters) {
      lines.push(chapter.title);
      lines.push('-'.repeat(chapter.title.length));
      lines.push('');
      lines.push(chapter.content);
      lines.push('');
      lines.push('');
    }

    const content = lines.join('\n');
    return {
      fileName: `${projectTitle}.txt`,
      content,
      format: ExportFormat.TXT,
      wordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
      chapterCount: chapters.length,
      mimeType: 'text/plain; charset=utf-8',
    };
  }

  // ==================== EPUB 简化版导出 ====================

  private exportEpub(projectTitle: string, chapters: ExportChapter[]): ExportResult {
    // 简化版 EPUB: 生成 XHTML 内容
    const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);

    const chapterItems = chapters
      .map(
        (ch, i) => `
    <section class="chapter" id="chapter-${i + 1}">
      <h2>${this.escapeHtml(ch.title)}</h2>
      ${ch.content
        .split(/\n\n+/)
        .map((p) => `<p>${this.escapeHtml(p.trim())}</p>`)
        .join('\n      ')}
    </section>`,
      )
      .join('\n');

    const content = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(projectTitle)}</title>
  <style>
    body { font-family: serif; margin: 5%; line-height: 1.8; }
    h1 { text-align: center; margin-bottom: 2em; }
    h2 { text-align: center; margin: 2em 0 1em; }
    p { text-indent: 2em; margin: 0.5em 0; }
    .toc { margin: 2em 0; }
    .toc a { display: block; margin: 0.3em 0; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(projectTitle)}</h1>
  <p style="text-align:center;color:#666;">总字数: ${totalWords}</p>

  <nav epub:type="toc" class="toc">
    <h2>目录</h2>
    ${chapters.map((ch, i) => `<a href="#chapter-${i + 1}">${this.escapeHtml(ch.title)}</a>`).join('\n    ')}
  </nav>

  ${chapterItems}
</body>
</html>`;

    return {
      fileName: `${projectTitle}.epub`,
      content,
      format: ExportFormat.EPUB,
      wordCount: totalWords,
      chapterCount: chapters.length,
      mimeType: 'application/epub+zip',
    };
  }

  // ==================== HTML 导出 ====================

  private exportHtml(projectTitle: string, chapters: ExportChapter[]): ExportResult {
    const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);

    const tocItems = chapters
      .map((ch, i) => `      <li><a href="#ch-${i + 1}">${this.escapeHtml(ch.title)}</a></li>`)
      .join('\n');

    const chapterHtml = chapters
      .map(
        (ch, i) => `
    <div class="chapter" id="ch-${i + 1}">
      <h2>${this.escapeHtml(ch.title)}</h2>
      ${ch.content
        .split(/\n\n+/)
        .map((p) => `<p>${this.escapeHtml(p.trim())}</p>`)
        .join('\n      ')}
    </div>`,
      )
      .join('\n');

    const content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(projectTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Noto Serif SC", "SimSun", serif; background: #fafafa; color: #333; line-height: 1.8; }
    .container { max-width: 800px; margin: 0 auto; padding: 2em 1em; }
    h1 { text-align: center; font-size: 2em; margin: 1em 0 0.5em; color: #222; }
    .meta { text-align: center; color: #999; font-size: 0.9em; margin-bottom: 2em; }
    .toc { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 1.5em; margin: 2em 0; }
    .toc h2 { text-align: center; margin-bottom: 1em; font-size: 1.3em; }
    .toc ul { list-style: none; padding: 0; }
    .toc li { margin: 0.5em 0; }
    .toc a { color: #666; text-decoration: none; display: block; padding: 0.3em 0; border-bottom: 1px dashed #eee; }
    .toc a:hover { color: #222; }
    .chapter { margin: 3em 0; }
    .chapter h2 { text-align: center; font-size: 1.5em; margin: 0 0 1.5em; color: #333; }
    .chapter p { text-indent: 2em; margin: 0.5em 0; text-align: justify; }
    hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
    footer { text-align: center; color: #ccc; padding: 2em; font-size: 0.8em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(projectTitle)}</h1>
    <p class="meta">总字数: ${totalWords} | 章节: ${chapters.length} | 导出时间: ${new Date().toLocaleString('zh-CN')}</p>

    <div class="toc">
      <h2>目录</h2>
      <ul>
${tocItems}
      </ul>
    </div>

    <hr />

${chapterHtml}

    <footer>
      <p>由 AI 写作平台导出 &mdash; ${new Date().toLocaleString('zh-CN')}</p>
    </footer>
  </div>
</body>
</html>`;

    return {
      fileName: `${projectTitle}.html`,
      content,
      format: ExportFormat.HTML,
      wordCount: totalWords,
      chapterCount: chapters.length,
      mimeType: 'text/html; charset=utf-8',
    };
  }

  // ==================== DOCX 导出 ====================

  private exportDocx(projectTitle: string, chapters: ExportChapter[]): ExportResult {
    const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);
    let bodyXml = '';

    // 标题
    bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${this.escapeHtml(projectTitle)}</w:t></w:r></w:p>`;
    bodyXml += `<w:p><w:r><w:t>总字数: ${totalWords} | 章节数: ${chapters.length}</w:t></w:r></w:p>`;

    for (const ch of chapters) {
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${this.escapeHtml(ch.title)}</w:t></w:r></w:p>`;
      const paragraphs = ch.content.split('\n').filter(l => l.trim());
      for (const para of paragraphs) {
        bodyXml += `<w:p><w:r><w:t>${this.escapeHtml(para.trim())}</w:t></w:r></w:p>`;
      }
    }

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>';
    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title>${this.escapeHtml(projectTitle)}</dc:title></cp:coreProperties>`;
    const contentTypeXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

    return {
      fileName: `${projectTitle}.docx`,
      content: `[Content_Types].xml|${contentTypeXml}||_rels/.rels|${relsXml}||word/document.xml|${docXml}||word/_rels/document.xml.rels|${docRelsXml}||word/styles.xml|${stylesXml}||docProps/core.xml|${coreXml}`,
      format: ExportFormat.DOCX,
      wordCount: totalWords,
      chapterCount: chapters.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // ==================== 工具方法 ====================

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
