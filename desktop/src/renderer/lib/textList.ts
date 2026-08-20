/**
 * Legacy text helpers.
 *
 * New business UI must consume typed API values and use typed field components.
 * These helpers remain only for old scalar text that has not yet been migrated.
 */
export function splitToLines(text: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(text)) return text.map(item => String(item).trim()).filter(Boolean);
  if (text === null || text === undefined) return [];
  const raw = String(text).trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|[；;]/)
    .map(item => item.replace(/^\s*(?:[-*•]|\d+[.、])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * @deprecated Diagnostic compatibility only. Do not use this to decide layout.
 * JSON values are decoded at the server boundary; the desktop should receive
 * real arrays/objects instead of JSON strings.
 */
export function parseJsonToReadable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';
    // 大纲和角色资料中的结构化字段有时以 JSON 字符串返回。
    // 先解码再按字段展示，避免在阅读视图中直接暴露 JSON。
    try { return parseJsonToReadable(JSON.parse(text)); } catch {
      const sequence = parseJsonSequence(text);
      return sequence ? parseJsonToReadable(sequence) : value;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? parseJsonToReadable(item) : readableObject(item)).filter(Boolean).join('\n\n');
  }
  if (typeof value === 'object') return readableObject(value);
  return '';
}

function readableObject(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;

  const character = stringValue(row.character) || stringValue(row.characterName) || stringValue(row.targetName) || stringValue(row.name);
  const action = stringValue(row.action);
  const result = stringValue(row.result) || stringValue(row.outcome);
  if (action) {
    return [
      character ? `${character}` : '',
      `  行动：${action}`,
      result ? `  结果：${result}` : '',
    ].filter(Boolean).join('\n');
  }

  const relationship = stringValue(row.description);
  const type = stringValue(row.type);
  const future = stringValue(row.future);
  if (character && (relationship || type || future)) {
    return [
      `${character}${type ? `（${type}）` : ''}`,
      relationship ? `  关系说明：${relationship}` : '',
      future ? `  后续发展：${future}` : '',
    ].filter(Boolean).join('\n');
  }

  const reference = stringValue(row.reference) || stringValue(row.foreshadowRef);
  const method = stringValue(row.method);
  if (reference || method) {
    return [
      reference ? `关联伏笔：${reference}` : '',
      method ? `回收方式：${method}` : '',
    ].filter(Boolean).join('\n');
  }

  for (const key of ['summary', 'description', 'content', 'text', 'title', 'name']) {
    const text = stringValue(row[key]);
    if (text) return text;
  }

  // 最后的兼容兜底：未知对象仅保留可读标量字段，而非回显 JSON 语法。
  return Object.entries(row)
    .map(([key, item]) => {
      const text = stringValue(item);
      return text ? `${readableLabel(key)}：${text}` : '';
    })
    .filter(Boolean)
    .join('；');
}

function readableLabel(key: string): string {
  const labels: Record<string, string> = {
    reference: '关联伏笔',
    foreshadowRef: '关联伏笔',
    method: '回收方式',
    description: '说明',
    future: '后续发展',
    result: '结果',
    outcome: '结果',
  };
  return labels[key] || key;
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Legacy LLM output may concatenate complete JSON values with `；` instead of
 * returning a JSON array. Decode only when every non-whitespace character is
 * part of a complete JSON value or a separator. */
function parseJsonSequence(text: string): unknown[] | null {
  const values: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start === -1) {
      if (/\s|；|;/.test(char)) continue;
      if (char !== '{' && char !== '[') return null;
      start = index;
      depth = 1;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
    if (depth < 0) return null;
    if (depth === 0) {
      try { values.push(JSON.parse(text.slice(start, index + 1))); } catch { return null; }
      start = -1;
    }
  }
  return start === -1 && values.length > 1 ? values : null;
}
