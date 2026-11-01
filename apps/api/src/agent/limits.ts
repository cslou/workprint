/** Turn limits (Lou, 2026-11-01). Production uses these; only a test composition may override them. */
export interface TurnLimits {
  /** UTF-8 bytes of one user message, checked at route admission. */
  readonly inputBytes: number;
  /** Output tokens per model call, including reasoning tokens. */
  readonly maxOutputTokens: number;
  /** Model calls per turn. */
  readonly maxSteps: number;
  /** A model call fails when no data arrives for this long; not a total duration. */
  readonly stallMs: number;
  /** Overall turn deadline. */
  readonly turnMs: number;
  /** Durable cleanup allowance after a turn settles. */
  readonly cleanupMs: number;
}

export const turnLimits: TurnLimits = Object.freeze({
  inputBytes: 32 * 1024,
  maxOutputTokens: 32768,
  maxSteps: 100,
  stallMs: 120_000,
  turnMs: 35 * 60_000,
  cleanupMs: 3000,
});

/** Failure notice when the final allowed step still asks for a tool. */
export const stepLimitReason = 'Stopped after too many steps.';

/** The only assistant model qualified for the MVP. */
export const assistantModels = ['meta/muse-spark-1.3'] as const;
export type AssistantModelId = typeof assistantModels[number];
