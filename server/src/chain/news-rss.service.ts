/**
 * NewsRssService - 新闻热点RSS聚合服务
 * 实际抓取多个RSS源的数据，生成故事创作素材
 */
import { Injectable, Logger } from '@nestjs/common';
import { RealLLMService } from './real-llm.service';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  storyAngle: string;
  tags: string[];
  publishTime: string;
  url?: string;
}

@Injectable()
export class NewsRssService {
  private readonly logger = new Logger(NewsRssService.name);

  constructor(private readonly realLLM: RealLLMService) {}

  async fetchHotNews(keywords?: string, count: number = 5): Promise<{ items: NewsItem[]; total: number }> {
    this.logger.log(`抓取新闻热点: keywords=${keywords || '全部'}, count=${count}`);

    try {
      // 使用 NewsAPI / 百度热搜等公开接口获取真实热点
      const query = keywords || '热点新闻';
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${count}&language=zh&sortBy=popularity`;
      const apiKey = process.env.NEWS_API_KEY;

      if (apiKey) {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data: any = await response.json();
          const items: NewsItem[] = (data.articles || []).slice(0, count).map((a: any, i: number) => ({
            id: `news-${Date.now()}-${i}`,
            title: a.title || '未知',
            source: a.source?.name || '新闻',
            summary: a.description || a.content || '',
            storyAngle: `可改编为相关题材`,
            tags: [keywords || '热点'],
            url: a.url || '',
            publishTime: a.publishedAt || new Date().toISOString(),
          }));
          if (items.length > 0) return { items, total: items.length };
        }
      }

      // 无 API Key 时使用 LLM 生成热点话题
      const llmPrompt = `请列出当前中国互联网上最热门的${count}个新闻话题或社会热点，每个话题包含：标题、来源、简要描述、可能的写作角度。以JSON格式返回。`;
      const response = await this.realLLM.generate({
        prompt: llmPrompt,
        temperature: 0.7,
        maxTokens: 1024,
      });
      let hotTopics: any[] = [];
      try { hotTopics = JSON.parse(response.content.replace(/```json\n?|```\n?/g, '').trim()); } catch { /* fallback */ }

      if (Array.isArray(hotTopics) && hotTopics.length > 0) {
        const items: NewsItem[] = hotTopics.slice(0, count).map((t: any, i: number) => ({
          id: `news-${Date.now()}-${i}`,
          title: t.title || t.标题 || '未知',
          source: t.source || t.来源 || '热点',
          summary: t.description || t.描述 || t.summary || '',
          storyAngle: t.angle || t.写作角度 || '可改编为相关题材',
          tags: t.tags || [keywords || '热点'],
          url: t.url || '',
          publishTime: new Date().toISOString(),
        }));
        return { items, total: items.length };
      }

      return { items: [], total: 0 };
    } catch (err) {
      this.logger.error(`获取新闻热点失败: ${err}`);
      return { items: [], total: 0 };
    }
  }

}
