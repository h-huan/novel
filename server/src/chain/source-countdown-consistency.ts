/** A calculable source fact is checked before asking a model to write from it. */
const DAY_NUMBERS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const days = (raw: string): number => Number(raw) || DAY_NUMBERS[raw] || 0;

const count = (raw: string): number => {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.includes('十')) {
    const [tens, ones] = raw.split('十');
    return (tens ? DAY_NUMBERS[tens] || 0 : 1) * 10 + (ones ? DAY_NUMBERS[ones] || 0 : 0);
  }
  return DAY_NUMBERS[raw] || 0;
};

export function detectSourceCountdownConflict(worldContext: string, outlineContract: string): string | null {
  // 这里曾只在首稿生成后的 LLM 评审里发现倒计时资料源矛盾，后果是先付费生成
  // 正文和评审，再因两份时间口径无法同时成立而停止所有精修。此处是同一事实的前置算术校验。
  // 这里曾只比对世界档案与大纲，漏掉同一份大纲内“三天后上午十点”与
  // “七十二小时倒计时”的第二份时间定义。夜间开始时两者不能同时成立，首稿
  // 只能猜选一个；没有当前时刻就先阻断并要求统一资料源。
  const deadline = outlineContract.match(/(?:爆破|起爆)[^。；\n]{0,80}?([一二两三四五六七八九十\d]+)天后(?:上午|早上|下午|晚上)?([一二两三四五六七八九十\d]+)点|([一二两三四五六七八九十\d]+)天后(?:上午|早上|下午|晚上)?([一二两三四五六七八九十\d]+)点[^。；\n]{0,80}?(?:爆破|起爆)/);
  const exactHours = [...outlineContract.matchAll(/([一二两三四五六七八九十\d]+)小时(?:倒计时|剩余|后)?/g)]
    .map(match => count(match[1])).find(value => value >= 24);
  if (deadline && exactHours !== undefined) {
    const relativeDays = count(deadline[1] || deadline[3]);
    const rawDeadlineHour = count(deadline[2] || deadline[4]);
    const deadlineHour = rawDeadlineHour + (/下午|晚上/.test(deadline[0]) && rawDeadlineHour < 12 ? 12 : 0);
    const now = outlineContract.match(/(?:当前|现在|此时|当下)[^。；\n]{0,30}?(?:上午|早上|下午|晚上)?([一二两三四五六七八九十\d]+)点/);
    if (!now) return `资料源倒计时未锚定：本章大纲同时要求「${deadline[0]}」与剩余 ${exactHours} 小时，却没有当前时刻。请保留日历起爆时刻或补齐可换算的当前时刻，正文尚未调用模型。`;
    const rawNowHour = count(now[1]);
    const nowHour = rawNowHour + (/下午|晚上/.test(now[0]) && rawNowHour < 12 ? 12 : 0);
    const calculated = relativeDays * 24 + deadlineHour - nowHour;
    if (!relativeDays || !deadlineHour || !nowHour || calculated !== exactHours) {
      return `资料源倒计时矛盾：本章大纲「${deadline[0]}」按当前 ${now[0]} 计算剩余 ${calculated} 小时，与所写 ${exactHours} 小时不符。请先统一大纲，正文尚未调用模型。`;
    }
  }
  const started = worldContext.match(/([一二两三四五六七八九十\d]+)天前[^。；\n]{0,140}?(\d+)小时倒计时(?:启动|开始)/);
  if (!started || !/爆破|起爆/.test(started[0])) return null;
  const future = outlineContract.match(/(?:爆破|起爆)[^。；\n]{0,60}?([一二两三四五六七八九十\d]+)天后|([一二两三四五六七八九十\d]+)天后[^。；\n]{0,60}?(?:爆破|起爆)/);
  if (!future) return null;
  const elapsedDays = days(started[1]);
  const futureDays = days(future[1] || future[2]);
  const totalHours = Number(started[2]);
  if (!elapsedDays || !futureDays || !Number.isFinite(totalHours)) return null;
  const remainingHours = totalHours - elapsedDays * 24;
  if (remainingHours === futureDays * 24) return null;
  return `资料源倒计时矛盾：世界档案「${started[0]}」按算术只剩 ${remainingHours} 小时；本章大纲「${future[0]}」要求从现在起 ${futureDays * 24} 小时。请先统一世界档案与大纲，正文尚未调用模型。`;
}
