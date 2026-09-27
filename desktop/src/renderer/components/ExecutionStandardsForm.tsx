/**
 * ExecutionStandardsForm - 执行标准表单（唯一实现）
 *
 * 平台投稿字段是创建执行前提；历史项目已填写的创作约束继续执行。
 * 1. 创建入口（想法确认后、创建作品之前）——选定后随创建请求写进创作宪法；
 * 2. 项目执行标准页（/project/:id/standards）——查看并补齐已有项目。
 * 两处必须是同一份控件、同一份判据，所以抽成受控组件：value / onChange 由调用方持有，
 * 判据来自 lib/executionStandards（与后端 missingConstitutionStandards 同源）。
 *
 * 组件自身不填默认值、不猜测、不跳过；缺项由调用方按 missingExecutionStandards 阻断。
 * 平台清单与平台显示名同样只有 lib/executionStandards 一份，这里不再自建任何平台表，
 * 也不再暴露「允许选通用」的开关——通用等于没选平台，任何入口放行它都是假放行。
 */

import React, { useEffect, useMemo, useState } from 'react';
import MultiSelectDropdown from './common/MultiSelectDropdown';
import CategoryReferencePicker from './common/CategoryReferencePicker';
import { categoryOptionsForPlatform, categoryReferenceOptionsForProject, dimensionGuide, platformCategoryDimensionBinding, platformCategoryWritingProfile, platformCategoryTreeVerification, platformCreationFieldNames, resolveSubmissionCategory } from '@novel/shared';
import { api } from '../lib/api';
import {
  audienceChannelOptions,
  CUSTOM_PLATFORM_VALUE,
  isCustomPlatformNoteMissing,
  parseCategory,
  joinCategory,
  categoryDisplayValue,
  categoryOptionId,
  platformLabel,
  PLATFORM_OPTIONS,
  unionOptions,
  targetWordsVerdict,
  type CategoryOption,
  type ExecutionStandardsValue,
} from '../lib/executionStandards';

export interface ExecutionStandardsFormProps {
  value: ExecutionStandardsValue;
  onChange: (next: ExecutionStandardsValue) => void;
  /** 提交中时禁用交互 */
  disabled?: boolean;
  /** 表单标题，默认「本书创作设定」 */
  heading?: string;
  /** 标题下的说明文字 */
  note?: string;
}

const ExecutionStandardsForm: React.FC<ExecutionStandardsFormProps> = ({
  value,
  onChange,
  disabled = false,
  heading = '本书创作设定',
  note,
}) => {
  const [toneTags, setToneTags] = useState<string[]>([]);
  const [writingStyles, setWritingStyles] = useState<string[]>([]);
  const [narrativePovs, setNarrativePovs] = useState<string[]>([]);
  const [creativeGenres, setCreativeGenres] = useState<string[]>([]);
  const [plotOptions, setPlotOptions] = useState<string[]>([]);

  useEffect(() => {
    api.get('/dict/writing_style').then((r) => setWritingStyles(((r as any)?.items || []).map((s: any) => s.label))).catch(() => {});
    api.get('/dict/narrative_pov').then((r) => setNarrativePovs(((r as any)?.items || []).map((p: any) => p.label))).catch(() => {});
    api.get('/dict/tone_tag').then((r) => setToneTags(((r as any)?.items || []).map((t: any) => t.label))).catch(() => {});
    api.get('/dict/web_novel_genre').then((r) => setCreativeGenres(((r as any)?.items || []).map((t: any) => t.label))).catch(() => {});
    api.get('/dict/plot_tag').then((r) => setPlotOptions(((r as any)?.items || []).map((t: any) => t.label))).catch(() => {});
  }, []);

  // 这里曾在字典读取失败时静默套用另一份前端候选，后果是管理页的删除/更名在项目卡片不生效。
  const povOptions = unionOptions(narrativePovs, value.pov ? [value.pov] : []);
  // 目标读者 = 所选平台投稿分类树里真实存在的频道（番茄=男频/女频；起点等还有纯爱/百合/无CP…）。
  // 平台未建模分类树时为空数组：该平台没有频道概念，只显示「不限定」，不拿别家频道凑数。
  const categoryVerification = platformCategoryTreeVerification(value.targetPlatform, value.projectType);
  const hasVerifiedCategoryOptions = categoryVerification?.verified === 'confirmed';
  const audienceOptions = useMemo(() => hasVerifiedCategoryOptions ? audienceChannelOptions(value.targetPlatform) : [], [value.targetPlatform, hasVerifiedCategoryOptions]);
  const platformGroups = useMemo(() => hasVerifiedCategoryOptions ? categoryOptionsForPlatform(value.targetPlatform) : [], [value.targetPlatform, hasVerifiedCategoryOptions]);
  // 选项身份带频道（`频道·分类名`）：番茄有 3 个投稿分类名在男女频各有一项，
  // 只按名字做身份的话下拉 key 会重复、频道映射会被后写覆盖，用户点的是哪一个就丢了。
  const categories: CategoryOption[] = useMemo(
    () => platformGroups.map((group) => ({ id: group.id, channel: group.channel, globalCategory: group.globalCategory, name: group.name, children: group.children, flat: group.flat })),
    [platformGroups],
  );
  // 目标读者只作为「跨频道同名」时的消歧提示参与解析；选项身份（带频道）优先，不参与猜测。
  const parsedCategory = useMemo(
    () => parseCategory(value.category, categories, value.targetAudience),
    [value.category, categories, value.targetAudience],
  );
  // 归位结果当场展示：归不了位就红字暴露（保存时后端同样会阻断，不让用户白填一遍才知道）。
  // channelHint 传目标读者（男频/女频）：同一个分类名在男女频都存在时靠它选中正确的那个，
  // 与后端执行标准用的是同一份判据。
  const placement = useMemo(
    () => resolveSubmissionCategory(value.targetPlatform, value.category, value.projectType, value.targetAudience),
    [value.targetPlatform, value.category, value.projectType, value.targetAudience],
  );
  // 下拉显示值：与上面的归位（= 后端执行标准）同源。历史写法「全局大类/子类」在平台侧对应多个
  // 投稿分类时 parseCategory 解析不出选项身份，但系统仍会按归位结果生成——
  // 显示必须跟上，否则「系统按 男频·都市日常 执行」和「下拉是空的」会同时出现在一屏上。
  const displayCategory = useMemo(
    () => categoryDisplayValue(parsedCategory, placement.status === 'resolved' ? placement.value : null),
    [parsedCategory, placement],
  );
  // 落库值本身不改写（不代替用户表达）：但显示值与落库值不同时必须写明，避免用户以为已按新写法保存。
  const displayedCategoryValue = joinCategory(displayCategory.major, displayCategory.minor);
  // 扁平平台（番茄等）：平台侧投稿分类只有一层，先选大类再选子类就是让用户把同一个名字选两遍。
  const selectedIsFlat = useMemo(
    () => categories.find((item) => categoryOptionId(item) === displayCategory.major)?.flat === true,
    [categories, displayCategory.major],
  );
  // 「分类」维目标总字数的确定性判据，与后端 platform-quality-rules 同源同一份数据
  // （platformCategoryMetric + PLATFORM_CATEGORY_METRICS）。未设定或落区间外会直接判该维未执行，
  // 必须在保存/生成之前就红字暴露 —— 在此之前，作者只能在正文全部生成后（约十分钟）才被 Gate 告知。
  const targetWordsState = useMemo(() => targetWordsVerdict(value), [value]);
  // 所选流派里与该分类头部官方标签对不上的那些：平台侧没有为它提供口径，必须由作者写明如何兑现该分类核心预期。
  const selectedGenreGaps = useMemo(() => {
    if (placement.status !== 'resolved') return [];
    return value.submissionTags
      .map((item) => platformCategoryDimensionBinding(value.targetPlatform, placement.value, 'genre', item, value.projectType).gap)
      .filter(Boolean);
  }, [placement, value.targetPlatform, value.projectType, value.submissionTags]);
  // 这里曾让项目卡片继续显示全局流派字典，而灵感发现按所选平台分类取标签；两处会再次分叉。
  const categoryProfile = placement.status === 'resolved'
    ? platformCategoryWritingProfile(value.targetPlatform, placement.value.channel, placement.value.platformGroup, value.projectType)
    : null;
  const fieldNames = platformCreationFieldNames(value.targetPlatform, value.projectType, Boolean(categoryProfile));
  const submissionOptions = categoryProfile ? categoryProfile.topTags.map((tag) => tag.name) : [];

  const isCustomPlatform = value.targetPlatform === CUSTOM_PLATFORM_VALUE;
  const customNoteMissing = isCustomPlatformNoteMissing(value);

  const patch = (partial: Partial<ExecutionStandardsValue>) => onChange({ ...value, ...partial });
  const toggleTag = (list: string[], tag: string): string[] => (
    list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag]
  );

  return (
    <div>
      <div style={s.heading}>{heading}</div>
      {note && <div style={s.note}>{note}</div>}

      <div style={s.sectionTitle}>目标平台</div>
      <select
        value={value.targetPlatform}
        disabled={disabled}
        onChange={(e) => patch({ targetPlatform: e.target.value, category: '', targetAudience: '', submissionTags: [], genreFitNote: '' })}
        style={s.select}
      >
        <option value="" style={s.option}>选择平台...</option>
        {unionOptions(PLATFORM_OPTIONS.map((item) => item.value), value.targetPlatform ? [value.targetPlatform] : []).map((v) => (
          <option key={v} value={v} style={s.option}>{platformLabel(v)}</option>
        ))}
      </select>

      {isCustomPlatform && (
        <>
          <textarea
            value={value.customPlatformNote}
            disabled={disabled}
            onChange={(e) => patch({ customPlatformNote: e.target.value })}
            placeholder="写出这个平台的执行标准：读者是谁、开篇几行进事件、单章多少字、多久一次回报、章尾怎么留钩、什么不能写。"
            rows={4}
            style={{ ...s.select, marginTop: '8px', resize: 'vertical', lineHeight: 1.7 }}
          />
          {customNoteMissing && <div style={s.hintError}>请填写自定义平台要求。</div>}
        </>
      )}

      <div style={s.sectionTitle}>{fieldNames.category}</div>
      {hasVerifiedCategoryOptions ? <div style={{ display: 'flex', gap: '8px' }}>
        <select
          value={displayCategory.major}
          disabled={disabled}
          onChange={(e) => patch({ category: e.target.value, submissionTags: [], genreFitNote: '' })}
          style={{ ...s.select, flex: 1 }}
        >
           <option value="" style={s.option}>选择平台分类...</option>
          {unionOptions(categories.map((item) => categoryOptionId(item)), displayCategory.major ? [displayCategory.major] : []).map((optionId) => (
            <option key={optionId} value={optionId} style={s.option}>{optionId}</option>
          ))}
        </select>
        {!selectedIsFlat && (
          <select
            value={displayCategory.minor}
            disabled={disabled || !displayCategory.major}
            onChange={(e) => patch({ category: joinCategory(displayCategory.major, e.target.value), submissionTags: [], genreFitNote: '' })}
            style={{ ...s.select, flex: 1, color: displayCategory.minor ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
          >
            <option value="" style={s.option}>选择子类...</option>
            {(categories.find((item) => categoryOptionId(item) === displayCategory.major)?.children || []).map((sub) => (
              <option key={sub} value={sub} style={s.option}>{sub}</option>
            ))}
          </select>
        )}
      </div> : <CategoryReferencePicker
        value={value.category}
        disabled={disabled}
        options={categoryReferenceOptionsForProject(value.targetPlatform, value.projectType)}
        onChange={(category) => patch({ category, submissionTags: [], genreFitNote: '' })}
      />}
      {hasVerifiedCategoryOptions && Boolean(value.category) && displayedCategoryValue !== value.category && (
        <div style={s.hint}>
          落库值仍是「{value.category}」，下拉显示的是系统实际执行的分类「{displayedCategoryValue}」；重选分类即改写为该平台的投稿分类写法。
        </div>
      )}
      {value.category && placement.status === 'unmapped' && (
        <div style={s.hintError}>
          「{value.category}」未在{platformLabel(value.targetPlatform) || '该平台'}的投稿分类中归位（{placement.reason}）。保存会被阻断——请改选该平台的投稿分类，不要留着对不上位的分类。
        </div>
      )}

      <div style={s.sectionTitle}>目标总字数（正文总字数，不是单章）</div>
      <input
        type="number"
        min={0}
        step={10000}
        value={value.targetWords ?? ''}
        disabled={disabled}
        onChange={(e) => patch({ targetWords: e.target.value })}
        placeholder="按该平台分类的实测体量区间填写，例如 1373345"
        style={s.select}
      />
      {targetWordsState.error && <div style={s.hintError}>{targetWordsState.note}</div>}
      {targetWordsState.deviationRequired && (
        <>
          <textarea
            value={value.categoryWordScaleDeviation}
            disabled={disabled}
            onChange={(e) => patch({ categoryWordScaleDeviation: e.target.value })}
            placeholder="写明刻意偏离该分类实测体量区间的取舍依据：这个体量为什么对这个分类成立（读者在哪读、按什么节奏读完、回报点怎么排）。"
            rows={3}
            style={{ ...s.select, marginTop: '8px', resize: 'vertical', lineHeight: 1.7 }}
          />
        </>
      )}

      {/* 这里曾把作者创作设定藏到仅历史值可见的折叠区，后果是新书无法选基调、文风、视角。 */}
      <div style={s.sectionTitle}>情绪氛围</div>
      <MultiSelectDropdown label="情绪氛围" value={value.storyTone} disabled={disabled}
        options={unionOptions(toneTags, value.storyTone).map((tag) => ({ value: tag, label: tag, hint: dimensionGuide('tone', tag) }))}
        onToggle={(tag) => patch({ storyTone: toggleTag(value.storyTone, tag) })} placeholder="选择情绪氛围" />
      <div style={s.sectionTitle}>文风</div>
      <MultiSelectDropdown label="文风" value={value.writingStyle} disabled={disabled}
        options={unionOptions(writingStyles, value.writingStyle).map((item) => ({ value: item, label: item, hint: dimensionGuide('style', item) }))}
        onToggle={(item) => patch({ writingStyle: toggleTag(value.writingStyle, item) })} placeholder="选择文风" />
      <div style={s.sectionTitle}>创作流派（可多选）</div>
      <MultiSelectDropdown label="创作流派"
        value={value.webNovelGenre} disabled={disabled}
        options={unionOptions(creativeGenres, value.webNovelGenre).map((item) => ({ value: item, label: item }))}
        onToggle={(item) => patch({ webNovelGenre: toggleTag(value.webNovelGenre, item) })}
        addPlaceholder="填写创作流派" placeholder="选择创作流派" />
      <div style={s.sectionTitle}>{fieldNames.genre || '投稿标签（如平台后台有此项）'}（可多选）</div>
      <MultiSelectDropdown label={fieldNames.genre || '投稿标签'}
        value={value.submissionTags} disabled={disabled}
        options={unionOptions(submissionOptions, value.submissionTags).map((item) => ({
          value: item, label: item,
          warning: value.submissionTags.includes(item) && placement.status === 'resolved'
            ? platformCategoryDimensionBinding(value.targetPlatform, placement.value, 'genre', item, value.projectType).gap : '',
        }))}
        onToggle={(item) => patch({ submissionTags: toggleTag(value.submissionTags, item) })}
        onAdd={(item) => patch({ submissionTags: [...value.submissionTags, item] })}
        addPlaceholder="填写投稿后台实际标签" placeholder="选择投稿标签" />
      {selectedGenreGaps.map((gap) => (
        <div key={gap} style={s.hintError}>{gap}</div>
      ))}
      {selectedGenreGaps.length > 0 && <textarea value={value.genreFitNote} disabled={disabled}
        onChange={(event) => patch({ genreFitNote: event.target.value })}
        placeholder="标签与分类契合依据：这些标签如何兑现该分类的读者预期"
        rows={2} style={{ ...s.select, resize: 'vertical', lineHeight: 1.6 }} />}
      <div style={s.sectionTitle}>情节取向（可多选）</div>
      <MultiSelectDropdown label="情节取向" value={value.plotTags} disabled={disabled}
        options={unionOptions(plotOptions, value.plotTags).map((item) => ({ value: item, label: item }))}
        onToggle={(item) => patch({ plotTags: toggleTag(value.plotTags, item) })}
        placeholder="选择情节取向" />

      <div style={s.sectionTitle}>叙事视角</div>
      <select
        value={value.pov}
        disabled={disabled}
        onChange={(e) => patch({ pov: e.target.value })}
        style={s.select}
      >
        <option value="" style={s.option}>选择叙事视角...</option>
        {unionOptions(povOptions, value.pov ? [value.pov] : []).map((item) => (
          <option key={item} value={item} style={s.option}>{item}</option>
        ))}
      </select>

      {hasVerifiedCategoryOptions && <><div style={s.sectionTitle}>目标读者（可选）</div>
      <select
        value={value.targetAudience}
        disabled={disabled}
        onChange={(e) => patch({ targetAudience: e.target.value })}
        style={s.select}
      >
        <option value="" style={s.option}>不限定</option>
        {unionOptions(audienceOptions, value.targetAudience ? [value.targetAudience] : []).map((item) => (
          <option key={item} value={item} style={s.option}>{item}</option>
        ))}
      </select></>}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  heading: { fontSize: '15px', fontWeight: 700 },
  note: { marginTop: '8px', fontSize: 'var(--font-size-xs)', lineHeight: 1.7, color: 'var(--color-text-secondary)' },
  sectionTitle: { marginTop: '20px', marginBottom: '10px', fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  select: {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', color: 'var(--color-text-primary)',
    fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none',
  },
  option: { backgroundColor: 'var(--color-bg-primary)' },
  hint: { marginTop: '7px', fontSize: 'var(--font-size-xs)', lineHeight: 1.6, color: 'var(--color-text-muted)' },
  hintError: { marginTop: '7px', fontSize: 'var(--font-size-xs)', lineHeight: 1.6, color: 'var(--color-error, #f85149)' },
};

export default ExecutionStandardsForm;
