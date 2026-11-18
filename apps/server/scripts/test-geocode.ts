/**
 * One-off: testa a localização por texto livre (rua, bairro, cidade, CEP).
 * Só geocoding — não lê nem escreve no banco. Uso (a partir de apps/server):
 *   npx tsx scripts/test-geocode.ts
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

import { geocodeArea } from '../src/lib/geocoding.js';

// Mistura de endereços de MG (devem passar) e de fora (devem ser rejeitados
// pela trava MG). Cidade de SP/CEP de SP não existem mais para o app.
const QUERIES = ['Graças, Belo Horizonte', 'Sabará', '30140-071', 'Uberaba', 'São Paulo', '01310-100'];

for (const q of QUERIES) {
  try {
    const g = await geocodeArea(q);
    console.log(
      `"${q}" -> lat=${g.lat.toFixed(5)} lng=${g.lng.toFixed(5)} | cidade=${g.city} | bairro=${g.neighborhood}\n        rótulo: ${g.label}`
    );
  } catch (err) {
    console.log(`"${q}" -> ERRO: ${(err as Error).message}`);
  }
}
