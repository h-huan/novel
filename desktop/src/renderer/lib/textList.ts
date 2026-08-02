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
  return raw.split(/[、，,；;\/\n\r]+/).map(s => s.trim()).filter(Boolean);
}
