/** Who made the bytes. Only assistant-made media may carry a provider's format and AI-generated label. */
export type MediaOrigin = 'upload' | 'assistant';
/**
 * What an assistant-made video may differ in from an upload, and nothing more: the traits of MiniMax's clips,
 * from the pinned-toolchain probe of the live clip (Sprint 009 Story 1). Its `ftyp free mdat moov` box order and
 * its `AIGC` metadata label already pass the upload rules. Everything else (full decode, constant frame rate,
 * at most 120 s, AAC-LC) stays as strict as for uploads.
 */
export const assistantVideoAllowance = Object.freeze({
  /** H.264 profiles beyond the uploads' Constrained Baseline. */
  profiles: Object.freeze(['Constrained Baseline', 'Main', 'High']),
  /** A missing `sample_aspect_ratio` is square pixels (1:1). */
  missingSampleAspectRatio: true,
  /** Either orientation: long side at most 1920, short side at most 1080, so a portrait 768P clip fits. */
  longSide: 1920, shortSide: 1080,
  /** The High-profile `avcC` tail: 4:2:0, 8-bit, no SPS extension (checked in `requireStableAvc`). */
  highProfileAvcC: true,
});
