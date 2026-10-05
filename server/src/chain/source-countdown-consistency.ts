/**
 * Advisory risk scan for explicit, calculable countdown/deadline wording.
 * Rule owner: CTX-005. No story-specific nouns/mechanics are allowed here.
 * Raw prose has no stable fact identity, so this helper MUST NOT block by itself; it only surfaces arithmetic risk to the semantic Gate.
 */
const DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

function count(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  const parts = raw.split('十');
  if (parts.length === 2) {
    const tens = parts[0] ? DIGITS[parts[0]] ?? 0 : 1;
    const ones = parts[1] ? DIGITS[parts[1]] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return DIGITS[raw] ?? Number.NaN;
}

function clockHour(rawHour: string, period = ''): number {
  const hour = count(rawHour);
  if (!Number.isFinite(hour)) return Number.NaN;
  if (/(下午|晚上)/.test(period) && hour < 12) return hour + 12;
  if (/凌晨/.test(period) && hour === 12) return 0;
  return hour;
}

interface DeadlineClaim {
  raw: string;
  days: number;
  hour: number;
}
interface RemainingClaim { raw: string; hours: number }
interface CurrentClaim { raw: string; hour: number }

const NUMBER = '[一二两三四五六七八九十零\\d]+';

function deadlineClaims(text: string): DeadlineClaim[] {
  const re = new RegExp(`(${NUMBER})天后(?:的)?(凌晨|上午|早上|中午|下午|晚上)?(${NUMBER})点`, 'g');
  return [...text.matchAll(re)].map((match) => ({
    raw: match[0], days: count(match[1]), hour: clockHour(match[3], match[2] || ''),
  })).filter((item) => Number.isFinite(item.days) && Number.isFinite(item.hour));
}

function remainingClaims(text: string): RemainingClaim[] {
  const re = new RegExp(`(?:倒计时|剩余|还剩)[^。；\\n]{0,12}?(${NUMBER})小时|(${NUMBER})小时[^。；\\n]{0,12}?(?:倒计时|剩余|还剩)`, 'g');
  return [...text.matchAll(re)].map((match) => ({
    raw: match[0], hours: count(match[1] || match[2]),
  })).filter((item) => Number.isFinite(item.hours));
}

function currentClaims(text: string): CurrentClaim[] {
  const re = new RegExp(`(?:当前|现在|此时|当下)[^。；\\n]{0,20}?(凌晨|上午|早上|中午|下午|晚上)?(${NUMBER})点`, 'g');
  return [...text.matchAll(re)].map((match) => ({
    raw: match[0], hour: clockHour(match[2], match[1] || ''),
  })).filter((item) => Number.isFinite(item.hour));
}

interface StartedCountdownClaim { raw: string; elapsedDays: number; totalHours: number }
function startedCountdownClaims(text: string): StartedCountdownClaim[] {
  const re = new RegExp(`(${NUMBER})天前[^。；\\n]{0,100}?(${NUMBER})小时[^。；\\n]{0,20}?(?:倒计时)(?:启动|开始)`, 'g');
  return [...text.matchAll(re)].map((match) => ({
    raw: match[0], elapsedDays: count(match[1]), totalHours: count(match[2]),
  })).filter((item) => Number.isFinite(item.elapsedDays) && Number.isFinite(item.totalHours));
}

/**
 * Raw-text advisory only. Uniqueness in a paragraph/document is not proof that two claims share
 * the same fact identity, so callers may log/surface this risk but must not throw a deterministic Gate.
 */
export function detectSourceCountdownRisk(worldContext: string, outlineContract: string): string | null {
  const deadlines = deadlineClaims(outlineContract);
  const remaining = remainingClaims(outlineContract);
  const current = currentClaims(outlineContract);

  if (deadlines.length === 1 && remaining.length === 1 && current.length === 1) {
    const expected = deadlines[0].days * 24 + deadlines[0].hour - current[0].hour;
    if (expected !== remaining[0].hours) {
      return `资料源可计算时间风险：按“${current[0].raw}”到“${deadlines[0].raw}”计算为 ${expected} 小时，与“${remaining[0].raw}”不符；请先统一同一倒计时事实，正文尚未调用模型。`;
    }
  }

  const started = startedCountdownClaims(worldContext);
  if (started.length === 1 && deadlines.length === 1) {
    const left = started[0].totalHours - started[0].elapsedDays * 24;
    const future = deadlines[0].days * 24;
    if (deadlines[0].hour === 0 && left !== future) {
      return `资料源可计算时间风险：世界资料“${started[0].raw}”计算剩余 ${left} 小时，而章纲“${deadlines[0].raw}”表示至少 ${future} 小时；请先统一同一倒计时事实。`;
    }
  }
  return null;
}
