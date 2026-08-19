/** 把未知类型的文本/数组/对象转成列表项，供列表化展示。 */
export function splitToLines(text: unknown): string[] {
  if (Array.isArray(text)) {
    return text.map(v => String(v ?? '').trim()).filter(Boolean);
  }
  if (text === null || text === undefined) return [];
  if (typeof text === 'object') {
    const obj = text as Record<string, unknown>;
    const summary = obj.summary ?? obj.description ?? obj.text ?? obj.core ?? '';
    return splitToLines(summary);
  }
  const raw = String(text).trim();
  if (!raw) return [];
  // 先尝试JSON解析，如果是JSON就转为可读文本再按行分割（避免JSON被标点拆碎）
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
    try {
      JSON.parse(raw);
      const readable = parseJsonToReadable(raw);
      if (readable) return readable.split(/\n+/).map(s => s.trim()).filter(Boolean);
    } catch { /* 不是合法JSON，继续按标点分割 */ }
  }
  // 按句号、问号、感叹号、分号、换行符拆分（句子结束符或列表分隔符）
  // 注意：顿号、是句内并列符号，不能作为分隔符，否则会把括号内的并列短语拆开
  return raw
    .split(/[。！？!?；;\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean)
    // 去掉列表项末尾残留的逗号、顿号等标点
    .map(s => s.replace(/[，,、；;]+$/, '').trim())
    .filter(Boolean);
}

/** 格式化单个JSON对象为可读文本 */
function formatJsonObject(item: any): string {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null) return String(item);
  const lines: string[] = [];
  // 首行：角色名 + [type] + 内容
  const firstLineParts: string[] = [];
  const charName = item.targetName || item.characterName || item.name || item.title;
  if (charName) firstLineParts.push(charName);
  if (item.type) firstLineParts.push(`[${item.type}]`);
  if (item.relation && !item.type) firstLineParts.push(`[${item.relation}]`);
  const content = item.content || item.description || item.text || item.point || item.highlight || item.summary;
  if (content) firstLineParts.push(content);
  if (firstLineParts.length > 0) lines.push(firstLineParts.join(' '));
  // 子字段：换行缩进
  if (item.evidenceText) lines.push(`  证据：${item.evidenceText}`);
  if (item.riskLevel) lines.push(`  风险：${item.riskLevel}`);
  if (item.reference) lines.push(`  参考：${item.reference}`);
  if (item.method) lines.push(`  方式：${item.method}`);
  if (item.character) lines.push(`  角色：${item.character}`);
  if (item.action) lines.push(`  行动：${item.action}`);
  if (item.result) lines.push(`  结果：${item.result}`);
  if (item.future) lines.push(`  未来：${item.future}`);
  if (item.goal) lines.push(`  目标：${item.goal}`);
  if (item.motivation) lines.push(`  动机：${item.motivation}`);
  // 角色状态变化
  if (item.stateBefore) lines.push(`  状态前：${item.stateBefore}`);
  if (item.stateAfter) lines.push(`  状态后：${item.stateAfter}`);
  if (item.trigger) lines.push(`  触发：${item.trigger}`);
  // 伏笔回收
  if (item.reference) lines.push(`  回收：${item.reference}`);
  if (item.method) lines.push(`  方式：${item.method}`);
  // 如果没有识别到任何字段，显示原始键值对
  if (lines.length === 0) {
    return Object.entries(item).map(([k, v]) => `${k}：${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
  }
  return lines.join('\n');
}

/**
 * 通用JSON解析：将字符串中所有JSON对象/数组解析为可读文本。
 * 支持：纯JSON数组、纯JSON对象、分号分隔的多个JSON对象、混合文本中的内联JSON。
 */
export function parseJsonToReadable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    if (Array.isArray(value)) return value.map(formatJsonObject).filter(Boolean).join('\n\n');
    if (typeof value === 'object') return formatJsonObject(value);
    return String(value);
  }
  const raw = value.trim();
  if (!raw) return '';
  // [DEBUG] 临时调试输出
  console.log('[parseJsonToReadable] input:', raw.substring(0, 150));
  // 先尝试整体JSON.parse（纯JSON数组/对象）
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
    try {
      const parsed = JSON.parse(raw);
      console.log('[parseJsonToReadable] 整体JSON.parse成功');
      if (Array.isArray(parsed)) return parsed.map(formatJsonObject).filter(Boolean).join('\n\n');
      if (typeof parsed === 'object' && parsed !== null) return formatJsonObject(parsed);
    } catch (e) {
      console.log('[parseJsonToReadable] 整体JSON.parse失败:', (e as Error).message);
    }
  }
  // 内联正则匹配所有JSON对象/数组（包括分号分隔的多个对象、混合文本中的内联JSON）
  const inlineJsonRegex = /(\{[^{}]*\}|\[[^\[\]]*\])/g;
  const matches = raw.match(inlineJsonRegex) || [];
  console.log('[parseJsonToReadable] 内联正则匹配到', matches.length, '个JSON对象');
  let hasMatch = false;
  const replaced = raw.replace(inlineJsonRegex, (match) => {
    try {
      const parsed = JSON.parse(match);
      hasMatch = true;
      if (Array.isArray(parsed)) {
        return parsed.map(formatJsonObject).filter(Boolean).join('\n\n');
      } else if (typeof parsed === 'object' && parsed !== null) {
        return formatJsonObject(parsed);
      }
    } catch (e) {
      console.log('[parseJsonToReadable] 内联JSON.parse失败:', (e as Error).message, 'match:', match.substring(0, 50));
      return match;
    }
    return match;
  });
  console.log('[parseJsonToReadable] hasMatch:', hasMatch, 'output:', replaced.substring(0, 150));
  if (!hasMatch) return raw;
  // 清理JSON对象之间残留的分号/逗号分隔符，替换为空行
  return replaced.replace(/\s*[;；,，]\s*(?=\[|\n|$)/g, '\n\n').trim();
}
