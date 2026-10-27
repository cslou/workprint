import { appendFileSync } from 'node:fs';
import { Socket } from 'node:net';

/** Qualification-only tripwire: records and rejects non-loopback Node TCP/fetch attempts. */
export function guardNetwork(log: string) {
  function admit(host: string) {
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
      appendFileSync(log, 'blocked non-loopback network attempt\n');
      throw new Error('Qualification blocked non-loopback network');
    }
  }
  const connect = Socket.prototype.connect;
  Socket.prototype.connect = function (this: Socket, ...input: unknown[]) {
    const args = Array.isArray(input[0]) ? input[0] as unknown[] : input;
    const first = args[0];
    if (first && typeof first === 'object') {
      const options = first as { host?: string; path?: string };
      if (!options.path) admit(options.host ?? 'localhost');
    } else if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
      admit(typeof args[1] === 'string' ? args[1] : 'localhost');
    }
    return Reflect.apply(connect, this, input) as Socket;
  } as typeof connect;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    admit(url.hostname);
    return originalFetch(input, init);
  };
}
