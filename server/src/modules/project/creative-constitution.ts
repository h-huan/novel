import { BadRequestException } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { getPlatform, targetForLength } from '../../chain/platform-benchmarks';
import { scorePolicy } from '../writing-quality/score-policy';
import { CHAPTER_WORD_RANGE } from '../../../shared/src';

export interface CreativeConstitution {
  qualityPolicy?: import('../writing-quality/score-policy').ScorePolicy;
  schemaVersion: 1;
  revision: number;
  projectType: string;
  targetPlatform: string;
  targetWords: number;
  platformRules: ReturnType<typeof targetForLength>;
  category: string;
  storyTone: string[];
  writingStyle: unknown;
  webNovelGenre: string[];
  pov: string;
  targetAudience: unknown;
  chapterWordRange: { min: number; max: number };
}

export function settingsObject(value: unknown): Record<string, any> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new BadRequestException('项目配置不是有效 JSON'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('项目配置必须为对象');
  return value as Record<string, any>;
}

function style(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? [];
  try { return JSON.parse(value); } catch { return value; }
}

function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' && value ? [value] : [];
}

/** Read the persisted authority. The migration/create boundary supplies it before normal reads. */
export function readConstitution(row: Record<string, any>): CreativeConstitution {
  const s = settingsObject(row.settings);
  const saved = s.creativeConstitution;
  if (saved !== undefined) {
    if (!saved || saved.schemaVersion !== 1 || !Number.isInteger(saved.revision) || saved.revision < 1
      || !['projectType', 'targetPlatform', 'category', 'pov'].every(k => typeof saved[k] === 'string')
      || !['storyTone', 'webNovelGenre'].every(k => Array.isArray(saved[k]) && saved[k].every((v: unknown) => typeof v === 'string'))
      || !Number.isFinite(saved.targetWords) || saved.targetWords < 0
      || !saved.platformRules || typeof saved.platformRules !== 'object'
      || !Number.isInteger(saved.chapterWordRange?.min) || !Number.isInteger(saved.chapterWordRange?.max)
      || saved.chapterWordRange.min <= 0 || saved.chapterWordRange.max < saved.chapterWordRange.min) {
      throw new BadRequestException('创作宪法版本无效，需修复配置');
    }
    return {
      ...structuredClone(saved),
      chapterWordRange: { ...CHAPTER_WORD_RANGE },
      platformRules: { ...saved.platformRules, chapterWords: [CHAPTER_WORD_RANGE.min, CHAPTER_WORD_RANGE.max] },
    };
  }
  const projectType = row.type || 'long_novel';
  const targetPlatform = typeof row.target_platform === 'string' && row.target_platform
    ? row.target_platform
    : 'generic';
  return {
    schemaVersion: 1, revision: 1, projectType, targetPlatform,
    targetWords: Number(row.target_words) || 0,
    platformRules: targetForLength(getPlatform(targetPlatform), projectType),
    category: '', storyTone: [], writingStyle: style(row.writing_style),
    webNovelGenre: [], pov: '', targetAudience: null,
    chapterWordRange: { ...CHAPTER_WORD_RANGE },
  };
}

/** Accept legacy request fields at the boundary, reject ambiguous changes. */
export function updateConstitution(row: Record<string, any>, dto: Record<string, any>): CreativeConstitution {
  const current = readConstitution(row);
  const next = structuredClone(current);
  const s = settingsObject(dto.settings);
  if (dto.chapterWordRange !== undefined && (
    dto.chapterWordRange?.min !== CHAPTER_WORD_RANGE.min
    || dto.chapterWordRange?.max !== CHAPTER_WORD_RANGE.max
  )) {
    throw new BadRequestException(`单章字数范围固定为${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字`);
  }
  const forbidden = ['creativeConstitution', 'targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre', 'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'pov', 'pointOfView', 'targetAudience', 'targetReaders', 'chapterWordRange'];
  const duplicate = forbidden.find(key => s[key] !== undefined);
  if (duplicate) throw new BadRequestException(`项目配置 ${duplicate} 必须使用创作宪法字段，不能写入 settings`);
  const fields: [keyof CreativeConstitution, unknown][] = [
    ['projectType', dto.type],
    ['targetPlatform', dto.targetPlatform],
    ['targetWords', dto.targetWords],
    ['category', dto.category],
    ['storyTone', dto.storyTone === undefined ? undefined : tags(dto.storyTone)],
    ['writingStyle', dto.writingStyle === undefined ? undefined : style(dto.writingStyle)],
    ['webNovelGenre', dto.webNovelGenre === undefined ? undefined : tags(dto.webNovelGenre)],
    ['pov', dto.pov],
    ['targetAudience', dto.targetAudience],
    ['chapterWordRange', dto.chapterWordRange],
  ];
  for (const [key, value] of fields) if (value !== undefined) (next as any)[key] = value;
  if (dto.qualityPolicy !== undefined) {
    try { next.qualityPolicy = scorePolicy(next, dto.qualityPolicy); }
    catch { throw new BadRequestException('评分权重或最低阈值无效'); }
  }
  next.chapterWordRange = { ...CHAPTER_WORD_RANGE };
  const r = next.chapterWordRange;
  next.platformRules = { ...targetForLength(getPlatform(next.targetPlatform), next.projectType), chapterWords: [next.chapterWordRange.min, next.chapterWordRange.max] };
  if (!Number.isFinite(next.targetWords) || next.targetWords < 0) throw new BadRequestException('目标字数无效');
  if (JSON.stringify(next) !== JSON.stringify(current)) next.revision++;
  return next;
}

/** Compatibility fields are projections, never independent authorities. */
export function constitutionSettings(settings: Record<string, any>, c: CreativeConstitution): Record<string, any> {
  const result = { ...settings };
  for (const key of ['targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre', 'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'pov', 'pointOfView', 'targetAudience', 'targetReaders', 'chapterWordRange']) delete result[key];
  return { ...result, creativeConstitution: c };
}

const CREATIVE_SETTING_KEYS = [
  'targetPlatform', 'platform', 'recommendedPlatform', 'storyCategory', 'category', 'genre',
  'storyTone', 'writingStyle', 'style', 'webNovelGenre', 'pov', 'pointOfView',
  'targetAudience', 'targetReaders', 'chapterWordRange',
];

/** Consolidate existing aliases into the same persisted constitution used by new projects. */
export function normalizeStoredConstitutions(db: DatabaseSync): void {
  const rows = db.prepare(
    'SELECT id,type,target_platform,platform_style,target_words,writing_style,settings FROM projects',
  ).all() as any[];
  const update = db.prepare(`UPDATE projects
    SET type=?,target_platform=?,platform_style=?,target_words=?,writing_style=?,settings=? WHERE id=?`);

  for (const row of rows) {
    let settings: Record<string, any>;
    try {
      const parsed = JSON.parse(row.settings || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      settings = parsed;
    } catch {
      continue;
    }

    const saved = settings.creativeConstitution && typeof settings.creativeConstitution === 'object'
      ? settings.creativeConstitution as Record<string, any>
      : null;
    const projectType = String(saved?.projectType || row.type || 'long_novel');
    const targetPlatform = String(saved?.targetPlatform || row.target_platform || row.platform_style
      || settings.targetPlatform || settings.platform || settings.recommendedPlatform || 'generic');
    const targetWords = Math.max(0, Number(saved?.targetWords ?? row.target_words) || 0);
    const chapterWordRange = { ...CHAPTER_WORD_RANGE };
    const savedRevision = Number(saved?.revision);
    const baseRevision = Number.isInteger(savedRevision) && savedRevision > 0 ? savedRevision : 1;
    const constitution: CreativeConstitution = {
      schemaVersion: 1,
      revision: baseRevision,
      projectType,
      targetPlatform,
      targetWords,
      platformRules: {
        ...targetForLength(getPlatform(targetPlatform), projectType),
        chapterWords: [chapterWordRange.min, chapterWordRange.max],
      },
      category: String(saved?.category ?? settings.category ?? settings.storyCategory ?? settings.genre ?? ''),
      storyTone: tags(saved?.storyTone ?? settings.storyTone),
      writingStyle: style(saved?.writingStyle ?? settings.writingStyle ?? settings.style ?? row.writing_style),
      webNovelGenre: tags(saved?.webNovelGenre ?? settings.webNovelGenre),
      pov: String(saved?.pov ?? settings.pov ?? settings.pointOfView ?? ''),
      targetAudience: saved?.targetAudience ?? settings.targetAudience ?? settings.targetReaders ?? null,
      chapterWordRange,
    };
    if (saved && JSON.stringify({ ...constitution, revision: saved.revision }) !== JSON.stringify(saved)) {
      constitution.revision = baseRevision + 1;
    }
    for (const key of CREATIVE_SETTING_KEYS) delete settings[key];
    settings.creativeConstitution = constitution;
    update.run(projectType, targetPlatform, targetPlatform, targetWords,
      JSON.stringify(constitution.writingStyle), JSON.stringify(settings), row.id);
  }
}

export function constitutionColumns(settings: Record<string, any>, c: CreativeConstitution) {
  return { type: c.projectType, target_platform: c.targetPlatform, platform_style: c.targetPlatform,
    target_words: c.targetWords, writing_style: JSON.stringify(c.writingStyle),
    settings: JSON.stringify(constitutionSettings(settings, c)) };
}
