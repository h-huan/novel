/** Reject a card whose explicit per-entry time rule conflicts with its stated fixed return time. */
export function ideaTimeConflict(idea: { hook?: unknown; description?: unknown }): boolean {
  const hook = String(idea.hook || '');
  const description = String(idea.description || '');
  const numeral = '([一二三四五六七八九十\\d]+)';
  const perEntry = new RegExp(`每(?:进|推|次)[^。；]{0,25}?(?:倒退|回退)${numeral}小时`).exec(hook + '。' + description)?.[1];
  const fixedReturn = new RegExp(`时间回到${numeral}小时前`).exec(hook + '。' + description)?.[1];
  return !!perEntry && !!fixedReturn && perEntry !== fixedReturn;
}
