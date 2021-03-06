import * as debugAPI from 'debug';
import { delay } from '../common';

import { DigitalOcean } from './index';
import { IDropletResponse } from './types';

const debug = debugAPI('hive-proxy:digitalocean:droplet');
const MIN_INIT_DELAY = 10000;
const MAX_INIT_DELAY = 20000;

export class Droplet {
  public readonly id: number;
  public readonly name: string;
  private privAddresses: string[] = [];

  constructor(private readonly api: DigitalOcean,
              private readonly config: IDropletResponse) {
    this.id = this.config.id;
    this.name = this.config.name;
  }

  public get addresses() {
    return this.privAddresses;
  }

  public async init(): Promise<void> {
    const timeout = MIN_INIT_DELAY +
      Math.random() * (MAX_INIT_DELAY - MIN_INIT_DELAY);
    debug(`initializing droplet after ${(timeout / 1000).toFixed(3)} secs`);
    await delay(timeout);

    debug('initializing droplet');
    const response = await this.api.retrieveDroplet(this.id);
    const config = response.droplet;

    if (config.status !== 'active') {
      debug('not ready, retrying');
      return await this.init();
    }

    const hasV4 = config.networks.v4 && config.networks.v4.length !== 0;
    const hasV6 = config.networks.v6 && config.networks.v6.length !== 0;
    if (!hasV4 && hasV6) {
      throw new Error('Droplet doesn\'t have public address!');
    }

    if (hasV4) {
      for (const addr of config.networks.v4!) {
        this.privAddresses.push(addr.ip_address);
      }
    }
    if (hasV6) {
      for (const addr of config.networks.v6!) {
        this.privAddresses.push(addr.ip_address);
      }
    }
    debug('done');
  }

  public async delete() {
    debug('deleting droplet');
    await this.api.deleteDroplet(this.id);
  }
}
