/**
 * An optional id from the model, trimmed: empty, whitespace or "null" means none and gives ''. The model sends a
 * value for every optional argument, so a wrong one must be harmless (the Muse Spark nullable-args rule).
 */
export const optionalId = (value: string) => { const trimmed = value.trim(); return trimmed.toLowerCase() === 'null' ? '' : trimmed; };
