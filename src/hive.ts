import * as http from 'http'
import * as debugAPI from 'debug';
import HTTPProxy = require('http-proxy');

import { DigitalOcean, Region, Size } from './digitalocean';
import { IDroneConfig, Drone } from './drone';
import { hash } from './common';

const debug = debugAPI('hive-proxy');

const DROPLET_NAME = 'hive-drone';

export interface IHiveCloudConfig {
  readonly provider: 'digitalocean';

  // DigitalOcean auth token
  readonly authToken?: string;

  // DigitalOcean config for each drone
  readonly region: Region;
  readonly size: Size;
  readonly image: string | number;
  readonly sshKey: string;
  readonly tag: string;
}

export interface IHiveConfig {
  // Count of worker drones
  readonly size: number;
  readonly drone: IDroneConfig;

  readonly cloud: IHiveCloudConfig;
}

export class Hive extends http.Server {
  private readonly proxy = new HTTPProxy();
  private readonly cloud: DigitalOcean;
  private readonly drones: (Promise<Drone> | Drone | undefined)[];
  private timer: any;

  // Cloud config
  private sshKeyId: number | undefined;
  private image: number | string | undefined;

  constructor(private readonly config: IHiveConfig) {
    super((req, res) => {
      this.onRequest(req, res).catch((e) => {
        res.writeHead(500);
        res.end(`Got error: ${e.stack}`);
      });
    });

    this.drones = new Array(this.config.size);
    this.cloud = new DigitalOcean(this.config.cloud.authToken);
  }

  public async init() {
    debug('deleting old droplets');
    await this.cloud.deleteDropletsByTag(this.config.cloud.tag);

    // Grab ssh key id
    debug('fetching ssh keys');
    const keys = await this.cloud.retrieveSSHKeys();

    const matchingKeys = keys.ssh_keys.filter((key) => {
      return key.name === this.config.cloud.sshKey;
    });
    if (matchingKeys.length === 0) {
      throw new Error(`SSH key with name "${this.config.cloud.sshKey}" ` +
        `not found!`);
    }
    this.sshKeyId = matchingKeys[0].id;
    debug(`got ssh key id ${this.sshKeyId}`);

    const imageName = this.config.cloud.image;
    if (typeof imageName === 'number') {
      this.image = imageName;
      return;
    }

    debug('fetching user images');
    const images = await this.cloud.listUserImages();

    const matchingImages = images.images.filter((image) => {
      return image.name === imageName;
    });
    if (matchingImages.length === 0) {
      debug(`no image with name "${imageName}" was found, using as slug`);
      this.image = imageName;
      return;
    }

    this.image = matchingImages[0].id;
    debug(`found image with id ${this.image}`);
  }

  public async destroy() {
    debug('deleting old droplets');
    await this.cloud.deleteDropletsByTag(this.config.cloud.tag);
    await new Promise((resolve) => super.close(resolve));
  }

  private async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const droneIndex = hash(req.url || '') % this.drones.length;
    debug(`forwarding request ${req.url} to drone ${droneIndex}`);

    // Drones shall not be deleted
    this.refresh();

    if (!this.drones[droneIndex]) {
      debug('time to spawn the drones!');
      await this.spawnDrones();
    }
    const drone = await this.drones[droneIndex]!;

    // Drones still shall not be deleted
    this.refresh();

    debug('proxying request');
    this.proxy.web(req, res, {
      target: drone.url,
      auth: this.config.drone.auth,
    }, (e) => {
      res.writeHead(500);
      res.end(`Got error: ${e.stack}`);
    });
  }

  private async spawnDrones() {
    const resolves: Array<(drone: Drone) => void> = [];
    for (let i = 0; i < this.drones.length; i++) {
      this.drones[i] = new Promise((resolve) => resolves.push(resolve));
    }

    const droplets = await this.cloud.createDroplets(
      this.drones.map(() => DROPLET_NAME),
      {
        region: this.config.cloud.region,
        size: this.config.cloud.size,
        image: this.image!,
        sshKeys: [ this.sshKeyId! ],
        tags: [ this.config.cloud.tag ],
      });

    await Promise.all(droplets.map(async (droplet, i) => {
      const drone = new Drone(droplet, this.config.drone);

      debug(`initializing drone ${i}`);
      await drone.init();
      debug(`drone ${i} ready`);

      this.drones[i] = drone;
      resolves[i](drone);
    }));
  }

  private refresh() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      debug(`timed out, delete all drones`);
      this.timer = undefined;

      this.drones.fill(undefined);
      this.cloud.deleteDropletsByTag(this.config.cloud.tag)
        .catch((e) => {
          debug(`timeout drone delete error: ${e.stack}`);
        });
    }, this.config.drone.timeout);
  }
}
