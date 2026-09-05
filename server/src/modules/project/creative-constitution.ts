import { BadRequestException } from '@nestjs/common';
import { getPlatform, targetForLength } from '../../chain/platform-benchmarks';

export interface CreativeConstitution {
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

/** Legacy aliases are resolved only here. Persisted constitutions always win on reads. */
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
    return structuredClone(saved);
  }
  const projectType = row.type || 'long_novel';
  // Old DTOs wrote generic even when the user selected a legacy platform.
  const candidates = [row.target_platform, row.platform_style, s.targetPlatform, s.platform];
  const targetPlatform = candidates.find(v => typeof v === 'string' && v && v !== 'generic') || 'generic';
  const range = targetForLength(getPlatform(targetPlatform), projectType).chapterWords;
  return {
    schemaVersion: 1, revision: 1, projectType, targetPlatform,
    targetWords: Number(row.target_words) || 0,
    platformRules: targetForLength(getPlatform(targetPlatform), projectType),
    category: String(s.storyCategory ?? s.category ?? s.genre ?? ''),
    storyTone: tags(s.storyTone), writingStyle: style(s.writingStyle ?? s.style ?? row.writing_style),
    webNovelGenre: tags(s.webNovelGenre), pov: String(s.pov ?? s.pointOfView ?? ''),
    targetAudience: s.targetAudience ?? s.targetReaders ?? null,
    chapterWordRange: s.chapterWordRange ?? { min: range[0], max: range[1] },
  };
}

/** Accept legacy request fields at the boundary, reject ambiguous changes. */
export function updateConstitution(row: Record<string, any>, dto: Record<string, any>): CreativeConstitution {
  const current = readConstitution(row);
  const next = structuredClone(current);
  const s = settingsObject(dto.settings);
  if (s.creativeConstitution !== undefined && JSON.stringify(s.creativeConstitution) !== JSON.stringify(current)) {
    throw new BadRequestException('不能通过 settings 覆盖创作宪法；请使用项目配置字段');
  }
  const select = (label: string, values: unknown[]): unknown => {
    const supplied = values.filter(v => v !== undefined);
    if (new Set(supplied.map(v => JSON.stringify(v))).size > 1) throw new BadRequestException(`${label}存在冲突来源`);
    return supplied[0];
  };
  const fields: [keyof CreativeConstitution, unknown][] = [
    ['projectType', select('作品形态', [dto.type, dto.projectMode])],
    ['targetPlatform', select('目标平台', [dto.targetPlatform, dto.platformStyle, s.targetPlatform, s.platform])],
    ['targetWords', dto.targetWords],
    ['category', select('分类', [s.storyCategory, s.category, s.genre])],
    ['storyTone', s.storyTone === undefined ? undefined : tags(s.storyTone)],
    ['writingStyle', select('写作风格', [dto.writingStyle, s.writingStyle, s.style].map(v => v === undefined ? undefined : style(v)))],
    ['webNovelGenre', s.webNovelGenre === undefined ? undefined : tags(s.webNovelGenre)],
    ['pov', select('POV', [s.pov, s.pointOfView])],
    ['targetAudience', select('目标读者', [s.targetAudience, s.targetReaders])],
    ['chapterWordRange', s.chapterWordRange],
  ];
  for (const [key, value] of fields) if (value !== undefined) (next as any)[key] = value;
  if (!s.chapterWordRange && (next.projectType !== current.projectType || next.targetPlatform !== current.targetPlatform)) {
    const range = targetForLength(getPlatform(next.targetPlatform), next.projectType).chapterWords;
    next.chapterWordRange = { min: range[0], max: range[1] };
  }
  const r = next.chapterWordRange;
  if (!r || !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min <= 0 || r.max < r.min) throw new BadRequestException('章节字数区间无效');
  next.platformRules = { ...targetForLength(getPlatform(next.targetPlatform), next.projectType), chapterWords: [next.chapterWordRange.min, next.chapterWordRange.max] };
  if (!Number.isFinite(next.targetWords) || next.targetWords < 0) throw new BadRequestException('目标字数无效');
  if (JSON.stringify(next) !== JSON.stringify(current)) next.revision++;
  return next;
}

/** Compatibility fields are projections, never independent authorities. */
export function constitutionSettings(settings: Record<string, any>, c: CreativeConstitution): Record<string, any> {
  const result = { ...settings };
  for (const key of ['targetPlatform', 'platform', 'recommendedPlatform', 'style', 'genre', 'category', 'pointOfView', 'targetReaders']) delete result[key];
  return { ...result, creativeConstitution: c, storyCategory: c.category, storyTone: c.storyTone,
    writingStyle: c.writingStyle, webNovelGenre: c.webNovelGenre, pov: c.pov,
    targetAudience: c.targetAudience, chapterWordRange: c.chapterWordRange };
}

export function constitutionColumns(settings: Record<string, any>, c: CreativeConstitution) {
  return { type: c.projectType, target_platform: c.targetPlatform, platform_style: c.targetPlatform,
    target_words: c.targetWords, writing_style: JSON.stringify(c.writingStyle),
    settings: JSON.stringify(constitutionSettings(settings, c)) };
}
