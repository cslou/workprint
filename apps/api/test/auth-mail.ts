import { setTimeout as delay } from 'node:timers/promises';

type Message = { ID: string; To: { Address: string }[] };
const addressedTo = (value: unknown, recipient: string): value is Message => {
  if (!value || typeof value !== 'object' || !('ID' in value) || typeof value.ID !== 'string' || !('To' in value) || !Array.isArray(value.To)) return false;
  return value.To.some(to => to && typeof to === 'object' && 'Address' in to && to.Address === recipient);
};

/** Observed Mailpit v1.31.3 API shape; raw mail/link/token data never becomes evidence. */
export async function capturedRecoveryLink(mailUrl: string, authOrigin: string, recipient: string, seen: Set<string>) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const response = await fetch(mailUrl + '/api/v1/messages', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('Owned mail-capture list failed');
    const list: unknown = await response.json();
    if (!list || typeof list !== 'object' || !('messages' in list) || !Array.isArray(list.messages)) throw new Error('Invalid owned mail-capture list shape');
    const summary: unknown = list.messages.find(message => addressedTo(message, recipient) && !seen.has(message.ID));
    if (addressedTo(summary, recipient)) {
      const message = await fetch(mailUrl + '/api/v1/message/' + encodeURIComponent(summary.ID), { signal: AbortSignal.timeout(2000) });
      if (!message.ok) throw new Error('Owned recovery message read failed');
      const detail: unknown = await message.json();
      if (!addressedTo(detail, recipient) || !('HTML' in detail) || typeof detail.HTML !== 'string') throw new Error('Invalid owned recovery-message shape');
      for (const match of detail.HTML.matchAll(/href=["']([^"']+)["']/g)) {
        let url: URL;
        try { url = new URL(match[1]!.replaceAll('&amp;', '&')); } catch { continue; }
        if (url.origin === authOrigin && !url.username && !url.password && url.pathname === '/auth/v1/verify' && url.searchParams.get('type') === 'recovery' && url.searchParams.has('token')) {
          seen.add(summary.ID); return url.href;
        }
      }
      throw new Error('Owned email did not contain the expected real recovery link');
    }
    await delay(100);
  }
  throw new Error('Owned recovery-email delivery deadline exceeded');
}
