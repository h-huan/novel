import { describe, expect, it } from 'vitest';
import { normalizeCharacterRole } from './characterRole';

describe('normalizeCharacterRole', () => {
  it('keeps generated role variants in a visible group', () => {
    expect(normalizeCharacterRole('protagonist')).toBe('protagonist');
    expect(normalizeCharacterRole('main')).toBe('major');
    expect(normalizeCharacterRole('主要反派')).toBe('major');
    expect(normalizeCharacterRole('导师同盟')).toBe('supporting');
    expect(normalizeCharacterRole('unknown-model-role')).toBe('supporting');
  });
});
