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
  /**
   * Output tokens for the one video-title call. Muse Spark always reasons first and counts it as output:
   * in four live probes at minimal effort a title spent 108–225 reasoning tokens (123–240 in all).
   */
  readonly titleTokens: number;
  /** Overall deadline of the one video-title call; it is never retried. */
  readonly titleMs: number;
}

export const turnLimits: TurnLimits = Object.freeze({
  inputBytes: 32 * 1024,
  maxOutputTokens: 32768,
  maxSteps: 100,
  stallMs: 120_000,
  turnMs: 35 * 60_000,
  cleanupMs: 3000,
  titleTokens: 1024,
  titleMs: 15_000,
});

/** Failure notice when the final allowed step still asks for a tool. */
export const stepLimitReason = 'Stopped after too many steps.';

/** The assistant models qualified for the MVP; the server takes one from `DEFAULT_ASSISTANT_MODEL`. Muse Wonder since Sprint 014. */
export const assistantModels = ['meta/muse-spark-1.3', 'meta/muse-wonder-1.0'] as const;
export type AssistantModelId = typeof assistantModels[number];
