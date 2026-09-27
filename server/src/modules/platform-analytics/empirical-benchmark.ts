import type { DatabaseSync } from 'node:sqlite';
import { getPlatform, measureAgainstTarget, targetForLength } from '../../chain/platform-benchmarks';

export interface EmpiricalBenchmarkFilter {
  projectId?: string | null;
  platform?: string | null;
  storyType?: string | null;
}

interface ChapterMetric {
  projectId: string;
  platform: string;
  storyType: string;
  category: string;
  chapterId: string;
  dialogueRatio: number;
  avgParaChars: number;
  longParaRatio: number;
  openingHook: boolean;
  endingHook: boolean;
  qualityScore: number | null;
  revisionCount: number;
}

const parse = (value: unknown): any => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
};

const avg = (values: number[]): number | null => values.length
  ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
  : null;

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
};

const rate = (items: ChapterMetric[], pick: (item: ChapterMetric) => boolean): number | null => items.length
  ? Number((items.filter(pick).length / items.length).toFixed(3))
  : null;

/**
 * Dynamic evidence benchmark built from accepted/high-quality chapters already
 * produced by this installation. It deliberately does NOT call the cohort
 * “bestsellers”: commercial head-list data is not present in the database.
 * Static platform-benchmarks remain the external industry baseline; once at
 * least five high-quality local chapters exist, the empirical cohort is shown
 * beside it instead of pretending a hard-coded target is live market evidence.
 */
export function empiricalPlatformBenchmark(db: DatabaseSync, filter: EmpiricalBenchmarkFilter = {}) {
  const where: string[] = ["COALESCE(c.word_count,0)>0", "LENGTH(TRIM(COALESCE(c.content,'')))>0"];
  const params: any[] = [];
  if (filter.projectId) { where.push('c.project_id=?'); params.push(filter.projectId); }
  if (filter.platform) { where.push("COALESCE(p.target_platform,'generic')=?"); params.push(filter.platform); }
  if (filter.storyType) { where.push('p.type=?'); params.push(filter.storyType); }

  const chapters = db.prepare(`SELECT c.id,c.project_id,c.chapter_index,c.content,c.status,
    p.type,p.target_platform,p.settings
    FROM chapters c JOIN projects p ON p.id=c.project_id
    WHERE ${where.join(' AND ')} ORDER BY c.project_id,c.chapter_index`).all(...params) as any[];

  const latestScores = new Map<string, number>();
  try {
    const reports = db.prepare(`SELECT chapter_id,overall_score FROM writing_quality_reports
      WHERE chapter_id IS NOT NULL ORDER BY created_at ASC,id ASC`).all() as any[];
    for (const report of reports) {
      const score = Number(report.overall_score);
      if (Number.isFinite(score)) latestScores.set(String(report.chapter_id), score);
    }
  } catch { /* older database: empirical cohort simply has no scores */ }

  const revisions = new Map<string, number>();
  try {
    const rows = db.prepare(`SELECT chapter_id,COUNT(*) count FROM writing_revision_records
      WHERE chapter_id IS NOT NULL GROUP BY chapter_id`).all() as any[];
    for (const row of rows) revisions.set(String(row.chapter_id), Number(row.count || 0));
  } catch { /* optional historical table */ }

  const metrics: ChapterMetric[] = chapters.map(chapter => {
    const platform = String(chapter.target_platform || 'generic');
    const storyType = String(chapter.type || 'short_story');
    const settings = parse(chapter.settings);
    const constitution = settings.creativeConstitution || {};
    const category = String(constitution.category || '未分类');
    const target = targetForLength(getPlatform(platform), storyType);
    const measured = measureAgainstTarget(String(chapter.content || ''), target).metrics;
    return {
      projectId: String(chapter.project_id), platform, storyType, category,
      chapterId: String(chapter.id),
      dialogueRatio: Number(measured.dialogueRatio || 0),
      avgParaChars: Number(measured.avgParaChars || 0),
      longParaRatio: Number(measured.longParaRatio || 0),
      openingHook: Boolean(measured.openingHasHook),
      endingHook: Boolean(measured.endingHasHook),
      qualityScore: latestScores.has(String(chapter.id)) ? latestScores.get(String(chapter.id))! : null,
      revisionCount: revisions.get(String(chapter.id)) || 0,
    };
  });

  const groups = new Map<string, ChapterMetric[]>();
  for (const metric of metrics) {
    const key = `${metric.platform}__${metric.storyType}__${metric.category}`;
    const list = groups.get(key) || [];
    list.push(metric);
    groups.set(key, list);
  }

  const results = [...groups.entries()].map(([key, all]) => {
    const [platform, storyType, category] = key.split('__');
    const profile = getPlatform(platform);
    const industry = targetForLength(profile, storyType);
    // Quality score is the primary admission signal; <=2 revisions prevents a
    // chapter that only became acceptable after repeated rewrites from defining
    // the “first-pass quality” benchmark.
    const qualified = all.filter(item => item.qualityScore !== null && item.qualityScore >= 85 && item.revisionCount <= 2);
    const cohort = qualified.length >= 5 ? qualified : [];
    return {
      platform,
      platformLabel: profile.label,
      storyType,
      category,
      observedChapterCount: all.length,
      qualifiedChapterCount: qualified.length,
      source: cohort.length >= 5 ? 'local_high_quality_cohort' : 'industry_baseline',
      sourceNote: cohort.length >= 5
        ? '动态值来自当前安装中同平台/同篇幅/同分类、最新质量分≥85且修订≤2次的章节；这是高质量本地样本，不等同于商业爆款销量数据。'
        : '高质量本地样本不足5章，暂按平台行业经验基线展示；不得称为实时爆款实测。',
      industryBaseline: {
        dialogueRatio: industry.dialogueRatio,
        avgParaCharsMax: industry.avgParaCharsMax,
        longParaRatioMax: industry.longParaRatioMax,
        openingHookRequired: true,
        endingHookRequired: industry.endingHook,
      },
      empirical: cohort.length >= 5 ? {
        sampleCount: cohort.length,
        dialogueRatioMedian: percentile(cohort.map(item => item.dialogueRatio), 0.5),
        dialogueRatioP75: percentile(cohort.map(item => item.dialogueRatio), 0.75),
        avgParaCharsMedian: percentile(cohort.map(item => item.avgParaChars), 0.5),
        longParaRatioMedian: percentile(cohort.map(item => item.longParaRatio), 0.5),
        openingHookRate: rate(cohort, item => item.openingHook),
        endingHookRate: rate(cohort, item => item.endingHook),
        avgQualityScore: avg(cohort.map(item => Number(item.qualityScore))),
        avgRevisionCount: avg(cohort.map(item => item.revisionCount)),
      } : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    policy: 'industry baseline + local high-quality cohort; no commercial bestseller claim without external evidence',
    available: results.length > 0,
    groups: results,
  };
}
