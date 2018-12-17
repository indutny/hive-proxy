#!/usr/bin/env npx ts-node
import { Hive } from '../src/hive';
import * as fs from 'fs';

if (process.argv.length < 3) {
  console.error(`Usage: ${process.argv[1]} config.json`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(process.argv[2]).toString());

const hive = new Hive(config);

(async () => {
  await hive.init();

  await new Promise((resolve) => {
    hive.listen(config.port, config.host, resolve);
  });

  console.error(`Listening on %j`, hive.address());

  await new Promise((resolve) => process.once('SIGINT', resolve));
  console.error('shutting down...');

  await hive.destroy();
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
