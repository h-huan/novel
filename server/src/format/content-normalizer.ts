import type { KeyValueSetting } from '@novel/shared';

export class ContentTypeError extends TypeError {
  constructor(public readonly field: string, expected: string, actual: unknown) {
    super(`${field}: expected ${expected}, got ${Array.isArray(actual) ? 'array' : typeof actual}`);
    this.name = 'ContentTypeError';
  }
}

export function safeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function requireText(value: unknown, field = 'value', fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new ContentTypeError(field, 'scalar text', value);
}

export function normalizeStringList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item !== 'string') throw new ContentTypeError('list item', 'string', item);
      return item.trim();
    }).filter(Boolean);
  }
  if (typeof value !== 'string') throw new ContentTypeError('list', 'string[]', value);
  const raw = value.trim();
  if (!raw || raw === '[object Object]') return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeStringList(parsed);
    } catch { /* legacy text handled below */ }
  }
  // Legacy-only adapter. Normal API writes must send arrays.
  return raw.split(/\r?\n|[；;]/).map(item => item.replace(/^[-*•\d.、\s]+/, '').trim()).filter(Boolean);
}

export function normalizeKeyValueList(value: unknown): KeyValueSetting[] {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw || raw === '[object Object]') return [];
    try { return normalizeKeyValueList(JSON.parse(raw)); } catch {
      return raw.split(/\r?\n/).map(line => {
        const index = line.search(/[：:]/);
        if (index < 0) return null;
        const key = line.slice(0, index).trim();
        const val = line.slice(index + 1).trim();
        return key || val ? { key, value: val } : null;
      }).filter((item): item is KeyValueSetting => Boolean(item));
    }
  }
  if (!Array.isArray(value)) throw new ContentTypeError('custom_settings', 'KeyValueSetting[]', value);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ContentTypeError(`custom_settings.${index}`, 'object', item);
    const row = item as Record<string, unknown>;
    return {
      key: requireText(row.key, `custom_settings.${index}.key`).trim(),
      value: requireText(row.value ?? row.val, `custom_settings.${index}.value`).trim(),
    };
  }).filter(item => item.key || item.value);
}

export function encodeStringList(value: unknown): string {
  return JSON.stringify(normalizeStringList(value));
}

export function encodeKeyValueList(value: unknown): string {
  return JSON.stringify(normalizeKeyValueList(value));
}

export function displayStructuredValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        if (typeof row.key === 'string') return row.value ? `${row.key}：${String(row.value)}` : row.key;
        if (typeof row.summary === 'string') return row.summary;
      }
      return '';
    }).filter(Boolean).join('；');
  }
  throw new ContentTypeError('display value', 'string or typed list', value);
}
