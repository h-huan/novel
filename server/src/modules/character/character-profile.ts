/** Current profile authority shared by the editor and writing context. */
export const PROFILE_FIELDS = ['alias_title','identity_occupation','faction_stance','role_type','appearance','personality_traits','abilities_skills','backstory','relationships','catchphrase_speech_style','goals_motivation','weaknesses_fears','supplementary'] as const;

export function hasCurrentProfile(profile: Record<string, unknown> | undefined): profile is Record<string, unknown> {
  if (!profile) return false;
  const clearableVoiceFields = ['voiceContract','character_voice_contract','speech_style','speech_register','speechRegister','catchphrase','catchphrases','speechRhythm','forbidden_words','forbiddenVocabulary'];
  if ([...PROFILE_FIELDS, ...clearableVoiceFields].some(field => Object.prototype.hasOwnProperty.call(profile, field))) return true;
  const populated = (value: unknown): boolean => {
    if (typeof value === 'string') return Boolean(value.trim());
    if (value && typeof value === 'object') return Object.values(value).some(populated);
    return typeof value === 'number' || typeof value === 'boolean';
  };
  return populated(profile);
}
