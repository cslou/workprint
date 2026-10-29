function port(value: string | undefined, fallback: number, setting: string): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) throw new Error(`Invalid ${setting}: expected a TCP port`);
  return Number(value);
}

/** One loopback origin for every Node-side browser harness consumer. */
export function browserTestSettings(env: Readonly<Record<string, string | undefined>>) {
  const browserPort = port(env.WORKPRINT_BROWSER_PORT, 4179, 'WORKPRINT_BROWSER_PORT');
  const previewPort = port(env.WORKPRINT_PREVIEW_PORT, 4180, 'WORKPRINT_PREVIEW_PORT');
  return {
    browserPort, browserOrigin: `http://127.0.0.1:${browserPort}`,
    previewPort, previewOrigin: `http://127.0.0.1:${previewPort}`,
  };
}

export const { browserPort, browserOrigin, previewPort, previewOrigin } = browserTestSettings(process.env);
