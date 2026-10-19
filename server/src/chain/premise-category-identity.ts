/** Local choice IDs bind to this request's exact platform/user category labels.
 * They are not inferred aliases and never classify or rewrite the story itself.
 */
export function premiseCategoryChoices(options: readonly string[]) {
  return [...new Set(options)].map((label, index) => ({ id: `K${index + 1}`, label }));
}

export function bindPremiseCategory(item: Record<string, unknown>, options?: readonly string[], strict = true): Record<string, unknown> {
  if (!options?.length) return item;
  const choices = premiseCategoryChoices(options);
  const label = String(item.storyCategory || '').trim();
  if (item.storyCategoryId === undefined) {
    const choice = choices.find(row => row.label === label) || (!label && choices.length === 1 ? choices[0] : undefined);
    return choice ? { ...item, storyCategoryId: choice.id, storyCategory: choice.label } : item;
  }
  const choice = choices.find(row => row.id === item.storyCategoryId);
  if (!choice || (label && choice.label !== label)) {
    if (!strict) return item;
    throw new Error(!choice ? `题材分类编号“${String(item.storyCategoryId)}”不在本次候选目录中`
      : '题材分类编号与正式名称不一致，禁止猜测映射或改分类标签');
  }
  return { ...item, storyCategoryId: choice.id, storyCategory: choice.label };
}

export function premiseCategoryIdentityDirective(options: readonly string[]) {
  return '\n【服务器分类编号目录】' + JSON.stringify(premiseCategoryChoices(options))
    + '\n分类只返回目录中的storyCategoryId，不自行生成storyCategory名称、近义名或合并名。'
    + 'pool每项选择一个编号；selectedPremises和重选项原样继承对应原池的编号。'
    + '正式名称由服务器绑定，故事仍须落实该分类的核心人物、冲突与兑现要求，编号正确不代表内容合格。';
}
