import * as debugAPI from 'debug';
import fetch from 'node-fetch';
import { Response } from 'node-fetch';

import { delay } from '../common';
import { Droplet } from './droplet';
import {
  ICreateDropletsResponse, IImagesResponse,
  IRetrieveDropletResponse, ISSHKeysResponse,
} from './types';

const debug = debugAPI('hive-proxy:digitalocean');

const API_URL = 'https://api.digitalocean.com/v2';

const RETRY_TIMEOUT = 500;
const MAX_DROPLETS = 10;

export { Droplet };

export type Region = 'nyc1' | 'nyc3';
export type Size = 's-1vcpu-1gb';

export interface IDropletConfig {
  readonly region: Region;
  readonly size: Size;
  readonly image: string | number;
  readonly sshKeys?: ReadonlyArray<number>;
  readonly tags?: ReadonlyArray<string>;
}

export class DigitalOcean {
  constructor(private readonly apiToken: string = process.env.API_TOKEN!) {
    if (!this.apiToken) {
      throw new Error(
        'Missing required API token. Please set API_TOKEN env var');
    }
  }

  public async retrieveSSHKeys(): Promise<ISSHKeysResponse> {
    return await this.request('GET', '/account/keys');
  }

  public async retrieveDroplet(id: number): Promise<IRetrieveDropletResponse> {
    return await this.request('GET', `/droplets/${id}`);
  }

  public async createDroplets(names: ReadonlyArray<string>,
                              config: IDropletConfig)
    : Promise<ReadonlyArray<Droplet>> {
    if (names.length > MAX_DROPLETS) {
      const chunks: string[][] = [];
      for (let i = 0; i < names.length; i += MAX_DROPLETS) {
        chunks.push(names.slice(i, i + MAX_DROPLETS));
      }

      const nestedList = await Promise.all(chunks.map(async (chunk) => {
        await this.createDroplets(chunk, config);
      }));

      return nestedList.flat();
    }

    const response = await this.request<ICreateDropletsResponse>(
      'POST',
      '/droplets',
      {
        image: config.image,
        names,
        region: config.region,
        size: config.size,
        ssh_keys: config.sshKeys,
        tags: config.tags,
      });

    const droplets = response.droplets.map((droplet) => {
      return new Droplet(this, droplet);
    });

    return await Promise.all(droplets.map(async (droplet) => {
      await droplet.init();
      return droplet;
    }));
  }

  public async deleteDroplet(id: number) {
    await this.request('DELETE', `/droplets/${id}`);
  }

  public async deleteDropletsByTag(tag: string) {
    await this.request('DELETE', `/droplets?tag_name=${escape(tag)}`);
  }

  public async listUserImages(): Promise<IImagesResponse> {
    return await this.request('GET', '/images?private=true');
  }

  private async request<RetValue>(method: string, path: string,
                                  body?: any): Promise<RetValue> {
    let res: Response;

    const jsonBody: string | undefined = body && JSON.stringify(body);

    debug(`requesting ${method} ${path} with body ${jsonBody}`);
    try {
      res = await fetch(`${API_URL}/${path}`, {
        body: jsonBody,
        headers: {
          'authorization': `Bearer ${this.apiToken}`,
          'content-type': 'application/json',
        },
        method,
      });
    } catch (e) {
      debug(`got error: ${e.stack}`);
      await this.delayRetry();
      return await this.request(method, path, body);
    }

    // Rate-limited
    if (res.status === 429) {
      const resetAt =
          (parseInt(res.headers.get('rateLimit-reset')!, 10) | 0) * 1000;
      debug(`rate limited until ${new Date(resetAt)}`);
      await delay(Math.max(0, resetAt - Date.now()));
      await this.delayRetry();
      return await this.request(method, path, body);
    }

    if (res.status < 200 || res.status > 300) {
      let errorBody: string;
      try {
        errorBody = await res.text();
      } catch (e) {
        errorBody = '<not available>';
      }
      throw new Error(`Invalid status code: ${res.status} body: ${errorBody}`);
    }

    if (method === 'DELETE' || method === 'HEAD') {
      // TODO(indutny): any better way?
      return undefined as never;
    }

    let resBody: RetValue;
    try {
      resBody = await res.json();
    } catch (e) {
      debug(`got error: ${e.stack}`);
      await this.delayRetry();
      return await this.request(method, path, body);
    }

    return resBody;
  }

  private async delayRetry(maxValue: number = RETRY_TIMEOUT) {
    const value = Math.random() * maxValue;
    debug(`retrying in ${(value / 1000).toFixed(3)} seconds`);
    await delay(value);
  }
}
