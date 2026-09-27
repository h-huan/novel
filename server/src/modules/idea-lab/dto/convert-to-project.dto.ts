/**
 * 转换为项目 DTO
 *
 * 从想法创建作品时，用户在项目卡片上看到并使用 平台/分类/基调/文风/流派/视角 这些执行标准。
 * 它们不是装饰性标签，而是框架层（世界观/人物/组织/地点/大纲/伏笔）与正文层都必须执行的验收前提，
 * 所以必须由创建入口原样接收。此前这个 DTO 只接收标题与确认想法，IdeaLab 链路无论草稿里写了什么，
 * 落库的创作宪法都是空分类/空基调/空文风/空流派/空视角——空值等于这项标准不存在，不是「不适用」。
 */
import { IsString, IsOptional, IsIn, IsArray, IsNumber, Min } from 'class-validator';
import { PLATFORM_IDS } from '../../../../shared/src';
import type { TargetPlatform } from '@novel/shared';

export class ConvertToProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  confirmedIdea?: string;

  /** 目标平台（覆盖草稿上的平台；草稿默认 generic，等于未设置，必须显式选定） */
  @IsOptional()
  @IsIn([...PLATFORM_IDS])
  targetPlatform?: TargetPlatform;

  /**
   * 自定义平台说明（targetPlatform === 'custom' 时必须提供）。
   *
   * 它就是「平台」这一维的执行值：自定义平台没有系统预置的节奏/回报/读者基准，
   * 所以标准只能来自用户这段话。为空 = 选了自定义平台却没给标准 → 未执行标准，
   * 创建入口直接阻断，绝不允许静默落回通用网文基准。
   */
  @IsOptional()
  @IsString()
  customPlatformNote?: string;

  /**
   * 目标总字数（正文总字数，不是单章）。
   *
   * 它是「分类」维的平台侧判据输入：该平台分类的头部实测体量来自 shared 的
   * PLATFORM_CATEGORY_METRICS，验收链的确定性判据 platform.category_word_scale /
   * platform.category_word_scale_unset 会逐值比对。不设默认值：转项目时重新填过就以本次为准，
   * 否则沿用草稿上的值（缺失即缺失，不得用平台推荐顶替）。
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  targetWords?: number;

  /**
   * 分类体量的取舍依据（执行标准「分类」维的执行值输入，与 project DTO 同名字段同源）。
   *
   * 转项目是「从想法开始」这条链路唯一一次接收执行标准的机会（草稿表没有更新执行标准的入口），
   * 所以取舍依据必须在这里接收；否则从想法创建的作品永远写不了偏离依据，
   * 目标字数稍有取舍就会在生成末尾被判 platform.category_word_scale 阻断。
   */
  @IsOptional()
  @IsString()
  categoryWordScaleDeviation?: string;

  /** 故事分类（执行标准·必填） */
  @IsOptional()
  @IsString()
  category?: string;

  /** 故事基调（执行标准·必填） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storyTone?: string[];

  /** 文风（执行标准·必填） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  writingStyle?: string[];

  /** 流派（执行标准·必填） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  webNovelGenre?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  submissionTags?: string[];

  /** 作者情节取向，与平台投稿标签分别保存。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plotTags?: string[];

  @IsOptional()
  @IsString()
  genreFitNote?: string;

  /** 叙事视角（执行标准·必填） */
  @IsOptional()
  @IsString()
  pov?: string;

  /** 目标读者（可选，不参与六维必填判据） */
  @IsOptional()
  @IsString()
  targetAudience?: string;
}
