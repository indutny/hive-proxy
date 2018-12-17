import fetch from 'node-fetch';
import * as debugAPI from 'debug';

import { Droplet } from './digitalocean';
import { delay } from './common';

const debug = debugAPI('hive-proxy:drone');

const RETRY_DELAY = 1000;

export interface IDroneConfig {
  readonly port: number;
  readonly timeout: number;
  readonly auth?: string;
}

export class Drone {
  private timer: any;
  private onTimeout: ((res: Promise<void>) => void) | undefined;

  constructor(private readonly droplet: Droplet,
              private readonly config: IDroneConfig) {
  }

  public async init(): Promise<void> {
    let timeout = RETRY_DELAY * Math.random();
    debug(`waiting ${timeout.toFixed(3)} ms to initialize drone`);
    await delay(timeout);

    try {
      const url = this.url + '/';
      debug(`attempting status check with request to "${url}"`);

      await fetch(url, {
        method: 'HEAD',
      });
    } catch (e) {
      debug(`status check failed ${e.stack}, retrying`);
      return await this.init();
    }
    this.refresh();
  }

  public get url(): string {
    if (this.droplet.addresses.length === 0) {
      throw new Error('No public addresses!');
    }

    return `http://${this.droplet.addresses[0]}:${this.config.port}`;
  }

  public refresh() {
    // Already fired
    if (!this.onTimeout) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      const resolve = this.onTimeout!;
      this.onTimeout = undefined;
      resolve(this.delete());
    }, this.config.timeout);
  }

  public async exit() {
    return new Promise((resolve) => {
      this.onTimeout = resolve;
    });
  }

  private async delete() {
    await this.droplet.delete();
  }
}
