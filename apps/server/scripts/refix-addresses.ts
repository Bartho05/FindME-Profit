/**
 * One-off: completa o endereço (bairro, cidade - UF, CEP) dos negócios
 * importados via mescla OSM+Mapbox (mergeFullAddress). Só toca nas linhas
 * que o needsFullAddress marca como incompletas — nada manual/csv/seed.
 * Uso (a partir de apps/server):
 *   npx tsx scripts/refix-addresses.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* .env ausente é ok */
}

import db from '../src/db/db.js';
import { mergeFullAddress, needsFullAddress, reverseDetail } from '../src/lib/geocoding.js';

const rows = db
  .prepare(
    "SELECT id, lat, lng, address FROM businesses WHERE lat IS NOT NULL AND lng IS NOT NULL AND source IN ('osm', 'mapbox', 'google') ORDER BY id"
  )
  .all() as Array<{ id: number; lat: number; lng: number; address: string | null }>;

let fixed = 0;
for (const b of rows) {
  // Incompleto sem UF/CEP — ou com o CEP truncado de rua ("01310", sem bairro)
  const needs = needsFullAddress(b.address) || (b.address != null && !/\d{5}-\d{3}/.test(b.address));
  if (!needs) continue;
  const detail = await reverseDetail(b.lat, b.lng);
  const merged = mergeFullAddress(b.address, detail);
  if (merged && merged !== b.address) {
    db.prepare('UPDATE businesses SET address = ?, city = COALESCE(?, city) WHERE id = ?').run(
      merged,
      detail.city,
      b.id
    );
    console.log(`#${b.id} -> ${merged}`);
    fixed++;
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`\n${fixed}/${rows.length} endereços atualizados.`);
