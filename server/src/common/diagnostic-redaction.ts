export function redactDiagnosticText(value: unknown): string {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:api[_-]?key|access_token|refresh_token|token|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(--(?:api-key|token|password|secret)\s+)[^\s]+/gi, '$1[REDACTED]')
    .slice(0, 4000);
}

export function redactDiagnosticValue(value: unknown, key = ''): any {
  const normalizedKey = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/(?:apikey|accesstoken|refreshtoken|authorization|password|clientsecret|credential|secret)$/.test(normalizedKey)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map(item => redactDiagnosticValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => [childKey, redactDiagnosticValue(childValue, childKey)]));
  }
  return value;
}
