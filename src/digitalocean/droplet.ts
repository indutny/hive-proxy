import * as debugAPI from 'debug';
import { delay } from '../common';

import { DigitalOcean } from './index';
import { IDropletResponse } from './types';

const debug = debugAPI('hive-proxy:digitalocean:droplet');
const IMPORT_DELAY = 2500;

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
    debug('initializing droplet after delay');
    await delay(IMPORT_DELAY);

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
