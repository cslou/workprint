import { parsePublicApiOrigin } from './public-config.js';
import { createBrowserClient } from './client.js';

declare const __WORKPRINT_PUBLIC_API_ORIGIN__: string | null;
export const publicApiConfig = parsePublicApiOrigin(__WORKPRINT_PUBLIC_API_ORIGIN__);
export function createConfiguredBrowserClient(getAccessToken: () => Promise<string | null>) {
  return createBrowserClient(__WORKPRINT_PUBLIC_API_ORIGIN__, getAccessToken);
}
