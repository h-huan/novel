import { jsonrepair } from 'jsonrepair';
import { validateContentContract, type ContentContractKind } from '../../shared/src';

export class StructuredOutputValidationError extends Error {
  constructor(public readonly issues: string[], public readonly raw: string) {
    super(`Structured output validation failed: ${issues.join('; ')}`);
    this.name = 'StructuredOutputValidationError';
  }
}

export function stripMarkdownJsonFence(content: string): string {
  const raw = String(content ?? '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : raw).trim();
}

export function parseStructuredObject(content: string): Record<string, unknown> {
  const cleaned = stripMarkdownJsonFence(content);
  if (!cleaned) throw new StructuredOutputValidationError(['empty response'], content);
  const candidates = [cleaned];
  try {
    const repaired = jsonrepair(cleaned);
    if (repaired !== cleaned) candidates.push(repaired);
  } catch { /* strict parse error is reported below */ }

  let parsed: unknown;
  let lastError = '';
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (parsed === undefined) throw new StructuredOutputValidationError([`invalid JSON: ${lastError || 'parse failed'}`], content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StructuredOutputValidationError(['top-level value must be an object'], content);
  }
  return parsed as Record<string, unknown>;
}

export function validateStructuredOutput(content: string, contract?: ContentContractKind): Record<string, unknown> {
  const parsed = parseStructuredObject(content);
  if (!contract) return parsed;
  const validation = validateContentContract(contract, parsed);
  if (!validation.ok) throw new StructuredOutputValidationError(validation.issues, content);
  return parsed;
}
