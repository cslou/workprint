/** Admission limits (bytes, a video's length and its audio rates) only; technical success never grants approval or selection. */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_VIDEO_BYTES = 100 * 1024 * 1024;
/** The longest video, in seconds, for uploads, assistant clips and joined videos alike. */
export const MAX_VIDEO_LENGTH_S = 120;
/** The AAC-LC sample rates a video's audio may use, for uploads, assistant clips and joined videos alike. */
export const VIDEO_AUDIO_RATES: readonly number[] = Object.freeze([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
