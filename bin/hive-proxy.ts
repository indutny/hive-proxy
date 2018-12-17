#!/usr/bin/env npx ts-node
import { Hive } from '../src/hive';

const hive = new Hive({
  size: 4,

  cloud: {
    provider: 'digitalocean',
    region: 'nyc1',
    size: 's-1vcpu-1gb',
    image: 'drone-prototype',
    sshKey: 'main',
    tag: 'test-hive',
  },

  drone: {
    port: 8000,
    timeout: 5000,
  }
});

hive.init().then(() => {
  hive.listen(8000, () => {
    console.error(`Listening on %j`, hive.address());

    process.on('SIGINT', () => {
      console.error('shutting down...');
      hive.destroy().catch((e) => {
        throw e;
      });
    });
  });
}).catch((e) => {
  throw e;
});
