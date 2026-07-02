/**
 * SocialExportService - 社交平台内容适配
 * K推文适配 + K平台发布
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class SocialExportService {
  /**
   * 适配抖音/短视频风格
   * 精简内容，添加话题标签，估算时长
   */
  adaptForDouyin(text: string): { content: string; hashtags: string[]; estimatedSeconds: number } {
    // 精简内容：提取前200字作为视频文案
    const cleaned = text
      .replace(/[#*_~`]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const content = cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;

    // 自动生成热门话题标签
    const hashtags = this.extractHashtags(content);

    // 估算阅读时长（按每秒4字计算）
    const estimatedSeconds = Math.max(15, Math.ceil(content.length / 4));

    return { content, hashtags, estimatedSeconds };
  }

  /**
   * 适配小红书风格
   * 加标题，加emoji，加标签
   */
  adaptForXiaohongshu(text: string): { title: string; content: string; hashtags: string[] } {
    const lines = text.split('\n').filter(Boolean);
    // 取第一行作为标题
    const title = lines[0]?.replace(/[#*_~`]/g, '').substring(0, 30) || '小说分享';
    const body = lines.slice(1).join('\n\n').substring(0, 800);

    const hashtags = this.extractHashtags(body);

    return {
      title,
      content: body,
      hashtags,
    };
  }

  /**
   * 适配微信公众号风格
   * 格式化标题、摘要、正文
   */
  adaptForWechat(text: string): { title: string; content: string; summary: string } {
    const lines = text.split('\n').filter(Boolean);
    const title = lines[0]?.replace(/[#*_~`]/g, '').substring(0, 30) || '小说分享';
    const body = lines.slice(1).join('\n\n');

    // 生成摘要（前100字）
    const plainText = body.replace(/[#*_~`]/g, '').trim();
    const summary = plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText;

    return {
      title,
      content: body,
      summary,
    };
  }

  /**
   * 从内容中提取可能的标签
   */
  private extractHashtags(text: string): string[] {
    const commonTags = [
      '小说', '写作', '创作', '故事', '网文',
      '玄幻', '言情', '科幻', '悬疑', '都市',
    ];

    const foundTags: string[] = [];
    for (const tag of commonTags) {
      if (text.includes(tag)) {
        foundTags.push(tag);
      }
    }

    // 如果找不到匹配标签，使用默认标签
    if (foundTags.length === 0) {
      return ['小说', '写作'];
    }

    return foundTags.slice(0, 5);
  }
}
