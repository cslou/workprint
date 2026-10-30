import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
export const docker = async (...args: string[]) => (await exec('docker', args, { timeout: 30000 })).stdout.trim();
type Identity = { id: string; owner: string | null; state?: string };

/** Names/labels are registered before acquisition; no shared resource is a cleanup target. */
export class AuthFixtureResources {
  readonly owner = randomUUID();
  readonly networkName = `workprint-auth-${this.owner}`;
  networkId = '';
  edgeNetworkId = '';
  readonly edgeNetworkName = `${this.networkName}-edge`;
  readonly containerIds: string[] = [];
  private containers: { name: string; id?: string }[] = [];

  private async inspect(kind: 'container' | 'network', reference: string): Promise<Identity | undefined> {
    try {
      const format = kind === 'container'
        ? '{"id":{{json .Id}},"owner":{{json (index .Config.Labels "workprint.fixture")}},"state":{{json .State.Status}}}'
        : '{"id":{{json .Id}},"owner":{{json (index .Labels "workprint.fixture")}}}';
      return JSON.parse(await docker(kind, 'inspect', '--format', format, reference)) as Identity;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 1 && 'stderr' in error && typeof error.stderr === 'string' && /No such (object|container|network)|network [^\n]+ not found/i.test(error.stderr)) return undefined;
      throw error;
    }
  }
  private owned(value: Identity, expectedId?: string) {
    if (value.owner !== this.owner || !/^[0-9a-f]{64}$/.test(value.id) || (expectedId && value.id !== expectedId)) throw new Error('Refusing cleanup or use: isolated Auth fixture ownership mismatch');
  }
  async createNetwork() {
    const result = await docker('network', 'create', '--internal', '--label', `workprint.fixture=${this.owner}`, this.networkName);
    const found = await this.inspect('network', this.networkName);
    if (!found) throw new Error('Isolated Auth network not acquired');
    this.owned(found, result);
    this.networkId = found.id;
    const edge = await docker('network', 'create', '--label', `workprint.fixture=${this.owner}`, this.edgeNetworkName);
    const edgeFound = await this.inspect('network', this.edgeNetworkName);
    if (!edgeFound) throw new Error('Isolated Auth edge network not acquired');
    this.owned(edgeFound, edge); this.edgeNetworkId = edgeFound.id;
  }
  async attachPrivate(id: string, owner: string, alias: string) {
    const container = await this.inspect('container', id);
    const network = await this.inspect('network', this.networkName);
    if (!container || container.id !== id || container.owner !== owner || !/^[0-9a-f-]{36}$/.test(owner)) throw new Error('Refusing network attachment of unowned fixture service');
    if (!network) throw new Error('Missing isolated Auth private network');
    this.owned(network, this.networkId);
    await docker('network', 'connect', '--alias', alias, this.networkName, id);
  }
  async run(suffix: string, image: string, args: string[], env: Record<string, string>) {
    if (!/^[a-z]+$/.test(suffix)) throw new Error('Invalid fixture service name');
    const privateOnly = suffix === 'auth';
    const networkName = privateOnly ? this.networkName : this.edgeNetworkName;
    const network = await this.inspect('network', networkName);
    if (!network) throw new Error('Missing isolated Auth network');
    this.owned(network, privateOnly ? this.networkId : this.edgeNetworkId);
    const target: { name: string; id?: string } = { name: `${this.networkName}-${suffix}` };
    this.containers.push(target);
    const result = await exec('docker', [
      'run', '--detach', '--name', target.name, '--label', `workprint.fixture=${this.owner}`,
      '--log-opt', 'max-size=1m', '--log-opt', 'max-file=1',
      '--network', networkName, '--network-alias', suffix,
      '--memory', suffix === 'mail' ? '128m' : '256m', '--cpus', '1', '--pids-limit', '128', '--stop-timeout', '5',
      ...Object.keys(env).flatMap(key => ['--env', key]), ...args, image,
    ], { env: { ...process.env, ...env }, timeout: 60000 });
    const found = await this.inspect('container', target.name);
    if (!found) throw new Error('Isolated Auth service not acquired');
    this.owned(found, result.stdout.trim());
    target.id = found.id; this.containerIds.push(found.id);
    try {
      if (found.state !== 'running') throw new Error('Service exited during acquisition');
      if (!privateOnly) await this.attachPrivate(found.id, this.owner, suffix);
    } catch {
      // Startup only, before accounts exist; redact every supplied value before diagnostics.
      const logs = await exec('docker', ['logs', '--tail', '8', found.id], { timeout: 10000 });
      let detail = logs.stdout + logs.stderr;
      for (const value of Object.values(env).filter(value => value.length > 7)) detail = detail.replaceAll(value, '[redacted]');
      detail = detail.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/g, '[redacted URL]');
      throw new Error(`Isolated ${suffix} startup failed: ${detail.slice(0, 1000)}`);
    }
    return found.id;
  }
  async pauseOwned(id: string) {
    if (!this.containerIds.includes(id)) throw new Error('Refusing unregistered service stop');
    const found = await this.inspect('container', id);
    if (!found) throw new Error('Missing isolated Auth service');
    this.owned(found, id);
    await docker('pause', id);
  }
  async logsContain(id: string, privateValue: string): Promise<boolean> {
    if (!this.containerIds.includes(id)) throw new Error('Refusing unregistered service logs');
    const found = await this.inspect('container', id);
    if (!found) throw new Error('Missing isolated Auth service');
    this.owned(found, id);
    const result = await exec('docker', ['logs', id], { timeout: 10000 });
    // Raw logs and the supplied value stay private in memory; never return/log a URI.
    return result.stdout.includes(privateValue) || result.stderr.includes(privateValue);
  }
  async port(id: string, port: number) {
    const found = await this.inspect('container', id);
    if (!found) throw new Error('Missing isolated Auth service');
    this.owned(found, id);
    const mapping = await docker('port', id, `${port}/tcp`);
    if (!/^127\.0\.0\.1:\d+$/.test(mapping)) throw new Error('Fixture service must bind only IPv4 loopback');
    return Number(mapping.split(':')[1]);
  }
  async closeContainers() {
    const errors: unknown[] = [];
    for (const target of [...this.containers].reverse()) {
      try {
        const found = await this.inspect('container', target.id ?? target.name);
        if (!found) continue;
        this.owned(found, target.id);
        target.id = found.id;
        try {
          if (found.state === 'paused') await docker('unpause', found.id);
          if (found.state === 'created' || found.state === 'exited') await docker('rm', '--volumes', found.id);
          else if (found.state !== 'removing') {
            await docker('stop', '--time', '5', found.id);
            await docker('rm', '--volumes', found.id);
          }
        } catch (error) {
          const remaining = await this.inspect('container', found.id);
          if (remaining && remaining.state !== 'removing') throw error;
        }
        const deadline = Date.now() + 10000;
        while (await this.inspect('container', found.id)) {
          if (Date.now() > deadline) throw new Error('Owned Auth service removal deadline exceeded');
          await delay(50);
        }
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Isolated Auth service cleanup failed');
  }
  async closeNetwork() {
    const errors: unknown[] = [];
    for (const [id, name] of [[this.networkId, this.networkName], [this.edgeNetworkId, this.edgeNetworkName]]) {
      try {
        const found = await this.inspect('network', id || name!);
        if (!found) continue;
        this.owned(found, id || undefined);
        await docker('network', 'rm', found.id);
        if (await this.inspect('network', found.id)) throw new Error('Owned Auth network removal failed');
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Owned Auth network cleanup failed');
  }
}
