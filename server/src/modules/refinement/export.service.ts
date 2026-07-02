/**
 * 多格式导出
 * 支持 Markdown/TXT/EPUB/HTML/PDF
 */
import { Injectable } from '@nestjs/common';
import type { ExportResult } from './dto/refinement.dto';

interface ExportOptions {
  title?: string;
  author?: string;
  coverImage?: string;
  language?: string;
  css?: string;
}

@Injectable()
export class ExportService {
  /**
   * 导出入口
   */
  export(content: string, format: string, options?: ExportOptions): ExportResult {
    switch (format) {
      case 'markdown':
        return this.exportMarkdown(content, options);
      case 'txt':
        return this.exportTxt(content, options);
      case 'epub':
        return this.exportEpub(content, options);
      case 'html':
        return this.exportHtml(content, options);
      case 'pdf':
        return this.exportPdf(content, options);
      case 'docx':
        return this.exportDocx(content, options);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Markdown 导出
   */
  exportMarkdown(content: string, options?: ExportOptions): ExportResult {
    const title = options?.title || '未命名文档';
    const author = options?.author || '';

    // 保持格式干净
    let md = `# ${title}\n\n`;
    if (author) md += `> 作者：${author}\n\n`;
    md += content;

    return {
      format: 'markdown',
      content: md,
      filename: `${title}.md`,
      mimeType: 'text/markdown',
    };
  }

  /**
   * TXT 纯文本导出
   */
  exportTxt(content: string, options?: ExportOptions): ExportResult {
    const title = options?.title || '未命名文档';

    // 去除markdown格式
    let text = content
      .replace(/#{1,6}\s+/g, '')      // 去除标题标记
      .replace(/\*\*(.*?)\*\*/g, '$1') // 去除加粗
      .replace(/\*(.*?)\*/g, '$1')     // 去除斜体
      .replace(/```[\s\S]*?```/g, '')   // 去除代码块
      .replace(/`(.*?)`/g, '$1')       // 去除行内代码
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 去除链接
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 去除图片
      .replace(/>\s+/g, '')            // 去除引用标记
      .replace(/[-*+]\s+/g, '')        // 去除列表标记
      .replace(/\n{3,}/g, '\n\n')      // 限制连续空行
      .trim();

    return {
      format: 'txt',
      content: text,
      filename: `${title}.txt`,
      mimeType: 'text/plain',
    };
  }

  /**
   * EPUB 导出 (生成简单epub结构，无需编译直接生成XML)
   */
  exportEpub(content: string, options?: ExportOptions): ExportResult {
    const title = options?.title || '未命名文档';
    const author = options?.author || '佚名';
    const language = options?.language || 'zh-CN';
    const date = new Date().toISOString().split('T')[0];

    // 分割章节
    const chapters = this.splitChapters(content);
    const chapterId = (n: number) => `chapter_${n}`;

    // 生成OPF (Package Document)
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${this.escapeXml(title)}</dc:title>
    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${this.escapeXml(author)}</dc:creator>
    <dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">${language}</dc:language>
    <dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">${date}</dc:date>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${chapters.map((_, i) => `<item id="${chapterId(i)}" href="${chapterId(i)}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${chapters.map((_, i) => `<itemref idref="${chapterId(i)}"/>`).join('\n    ')}
  </spine>
</package>`;

    // 生成NCX (Navigation Control)
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${this.generateUuid()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${this.escapeXml(title)}</text></docTitle>
  <docAuthor><text>${this.escapeXml(author)}</text></docAuthor>
  <navMap>
    ${chapters.map((ch, i) => `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${this.escapeXml(ch.title)}</text></navLabel>
      <content src="${chapterId(i)}.xhtml"/>
    </navPoint>`).join('')}
  </navMap>
</ncx>`;

    // 生成章节XHTML
    const chapterXhtmls = chapters.map(
      (ch, i) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${this.escapeXml(ch.title)}</title></head>
<body>
  <h1>${this.escapeXml(ch.title)}</h1>
  ${ch.content.split('\n').filter((p) => p.trim()).map((p) => `<p>${this.escapeXml(p)}</p>`).join('\n  ')}
</body>
</html>`,
    );

    // 生成container.xml
    const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    // 组装EPUB (实际为ZIP格式, 这里返回XML内容集合)
    const epubContent = [
      { path: 'mimetype', content: 'application/epub+zip' },
      { path: 'META-INF/container.xml', content: container },
      { path: 'OEBPS/content.opf', content: opf },
      { path: 'OEBPS/toc.ncx', content: ncx },
      ...chapterXhtmls.map((xhtml, i) => ({
        path: `OEBPS/${chapterId(i)}.xhtml`,
        content: xhtml,
      })),
    ].map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');

    return {
      format: 'epub',
      content: epubContent,
      filename: `${title}.epub`,
      mimeType: 'application/epub+zip',
    };
  }

  /**
   * HTML 导出 (单文件含CSS)
   */
  exportHtml(content: string, options?: ExportOptions): ExportResult {
    const title = options?.title || '未命名文档';
    const author = options?.author || '';
    const customCss = options?.css || '';

    const defaultCss = `
      body { font-family: "宋体", "SimSun", serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.8; color: #333; }
      h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
      h2 { margin-top: 30px; border-left: 4px solid #666; padding-left: 10px; }
      h3 { margin-top: 20px; }
      p { text-indent: 2em; margin: 0.5em 0; }
      blockquote { border-left: 3px solid #ccc; margin: 10px 0; padding: 5px 15px; color: #666; background: #f9f9f9; }
      pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
      hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }
      .author { text-align: center; color: #666; margin-bottom: 30px; }
    `;

    // 简单的 markdown 到 HTML 转换
    let body = this.markdownToHtml(content);

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeXml(title)}</title>
  <style>${defaultCss}\n${customCss}</style>
</head>
<body>
  <h1>${this.escapeXml(title)}</h1>
  ${author ? `<p class="author">作者：${this.escapeXml(author)}</p>` : ''}
  ${body}
</body>
</html>`;

    return {
      format: 'html',
      content: html,
      filename: `${title}.html`,
      mimeType: 'text/html',
    };
  }

  /**
   * PDF 导出 (预留接口，使用html-to-pdf)
   */
  exportPdf(content: string, options?: ExportOptions): ExportResult {
    // 先生成HTML
    const htmlResult = this.exportHtml(content, options);

    // 在实际实现中，此处使用 Puppeteer/Playwright 或其他html-to-pdf工具
    // 当前返回HTML + PDF标记
    const pdfContent = `[PDF导出接口]
需要安装依赖实现实际的PDF生成：
- 方案1: 使用 Puppeteer/Playwright 将HTML转为PDF
- 方案2: 使用 pdfkit 直接生成PDF
- 方案3: 使用 wkhtmltopdf 命令行工具

当前返回HTML预览，可直接在浏览器中打印为PDF。

${htmlResult.content}`;

    return {
      format: 'pdf',
      content: pdfContent,
      filename: `${options?.title || '未命名文档'}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  /**
   * DOCX 导出 — 生成 Office Open XML 格式
   */
  exportDocx(content: string, options?: ExportOptions): ExportResult {
    const title = options?.title || '未命名文档';
    const author = options?.author || '';
    const paragraphs = content.split('\n').filter(p => p.trim());
    let bodyXml = '';
    for (const para of paragraphs) {
      const t = para.trim();
      if (t.startsWith('# ')) bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${this.escapeXml(t.slice(2))}</w:t></w:r></w:p>`;
      else if (t.startsWith('## ')) bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${this.escapeXml(t.slice(3))}</w:t></w:r></w:p>`;
      else if (t) bodyXml += `<w:p><w:r><w:t>${this.escapeXml(t)}</w:t></w:r></w:p>`;
    }
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>';
    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title>${this.escapeXml(title)}</dc:title><dc:creator>${this.escapeXml(author)}</dc:creator></cp:coreProperties>`;
    const contentTypeXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

    return {
      format: 'docx',
      content: `[Content_Types].xml\n${contentTypeXml}\n---\n_rels/.rels\n${relsXml}\n---\nword/document.xml\n${docXml}\n---\nword/_rels/document.xml.rels\n${docRelsXml}\n---\nword/styles.xml\n${stylesXml}\n---\ndocProps/core.xml\n${coreXml}`,
      filename: `${title}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  /**
   * 支持导出的格式列表
   */
  getSupportedFormats(): { id: string; name: string; mimeType: string; description: string }[] {
    return [
      { id: 'markdown', name: 'Markdown', mimeType: 'text/markdown', description: '保持格式干净，支持版本管理' },
      { id: 'txt', name: '纯文本(TXT)', mimeType: 'text/plain', description: '最简格式，兼容性最佳' },
      { id: 'epub', name: 'EPUB电子书', mimeType: 'application/epub+zip', description: '标准电子书格式，支持阅读器' },
      { id: 'html', name: 'HTML网页', mimeType: 'text/html', description: '单文件HTML，含CSS样式' },
      { id: 'pdf', name: 'PDF文档', mimeType: 'application/pdf', description: '便携式文档格式（需安装转换工具）' },
      { id: 'docx', name: 'Word文档(DOCX)', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', description: 'Microsoft Word 兼容格式' },
    ];
  }

  private splitChapters(content: string): { title: string; content: string }[] {
    const lines = content.split('\n');
    const chapters: { title: string; content: string }[] = [];
    let currentTitle = '第一章';
    let currentContent: string[] = [];

    for (const line of lines) {
      const chapterMatch = line.match(/^#{1,2}\s+(第[一二三四五六七八九十百千\d]+[章节部]|第\d+章|[一二三四五六七八九十]+、)/);
      if (chapterMatch) {
        if (currentContent.length > 0) {
          chapters.push({ title: currentTitle, content: currentContent.join('\n') });
        }
        currentTitle = line.replace(/^#+\s+/, '');
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentContent.length > 0 || chapters.length === 0) {
      chapters.push({ title: currentTitle, content: currentContent.join('\n') });
    }

    return chapters;
  }

  private markdownToHtml(md: string): string {
    let html = md
      // 标题
      .replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
      // 粗体和斜体
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 引用
      .replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>')
      // 水平线
      .replace(/^---$/gm, '<hr>')
      // 段落 (双换行)
      .replace(/\n\n/g, '</p><p>');

    return `<p>${html}</p>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
