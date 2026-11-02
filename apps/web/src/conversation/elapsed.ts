/** A running line's elapsed time: seconds under a minute, then whole minutes rounded down. */
export const elapsedLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)} min`;
