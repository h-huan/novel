/** Canonical entity writer aliases reuse the same domain service instance
 * without importing entity modules from StateModule (circular dependency). */
export const ENTITY_WRITER_TOKENS={
  character:'novel.canon.entity.character',
  organization:'novel.canon.entity.organization',
  map_point:'novel.canon.entity.map_point',
  foreshadowing:'novel.canon.entity.foreshadowing',
} as const;
