/**
 * One-off: testa o provider Overpass direto (retry/mirrors/concorrência),
 * sem tocar no banco. Uso (a partir de apps/server):
 *   npx tsx scripts/test-overpass.ts [lat] [lng]
 */
import { searchOsm } from '../src/lib/providers/overpass.js';

const lat = Number(process.argv[2] ?? '-19.9167');
const lng = Number(process.argv[3] ?? '-43.9345');

const cats = [
  { id: 'alimentacao', label: 'Alimentação', osmFilters: ['["amenity"="cafe"]', '["shop"="bakery"]'] },
  { id: 'beleza', label: 'Beleza e estética', osmFilters: ['["shop"="beauty"]', '["shop"="hairdresser"]'] },
  { id: 'saude', label: 'Saúde', osmFilters: ['["amenity"="pharmacy"]', '["healthcare"="dentist"]'] },
  { id: 'automotivo', label: 'Automotivo', osmFilters: ['["shop"="car_repair"]'] },
];

const t0 = Date.now();
try {
  const r = await searchOsm({ lat, lng, radiusKm: 2, categories: cats, defaultCity: 'São Paulo', limit: 5 });
  console.log(
    `ok em ${Date.now() - t0}ms — ${r.results.length} resultados, ${r.withSite} com site`
  );
  for (const f of r.results.slice(0, 4)) {
    console.log(` - ${f.name} | ${f.address ?? 'sem endereço'} | ${f.phone ?? 'sem fone'}`);
  }
} catch (err) {
  console.log(`ERRO (${Date.now() - t0}ms): ${(err as Error).message}`);
}
