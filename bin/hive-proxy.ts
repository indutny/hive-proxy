#!/usr/bin/env npx ts-node
import { Hive } from '../src/hive';
import * as fs from 'fs';

if (process.argv.length < 3) {
  console.error(`Usage: ${process.argv[1]} config.json`);
  process.exit(1);
}

const config = fs.readFileSync(process.argv[2]).toString();

const hive = new Hive(JSON.parse(config));

hive.init().then(() => {
  hive.listen(config.port, config.host, () => {
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
