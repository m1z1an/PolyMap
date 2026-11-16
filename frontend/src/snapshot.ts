import type { Bundle, Snapshot } from './model';

export async function loadSnapshot(): Promise<Snapshot> {
  const manifest = require('../public/maps/manifest.json') as { version: string };
  const data = require('../public/maps/campus.json') as Bundle;
  return { version: manifest.version, data };
}
