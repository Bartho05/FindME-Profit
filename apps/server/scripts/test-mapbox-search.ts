/**
 * One-off: valida a Search Box API da Mapbox como fonte de negócios
 * (substituto do Overpass). NÃO lê nem escreve no banco. Uso (a partir
 * de apps/server):
 *   npx tsx scripts/test-mapbox-search.ts [lat] [lng]
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

const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
if (!token) {
  console.log('ERRO: MAPBOX_ACCESS_TOKEN ausente no .env');
  process.exit(1);
}

const lat = Number(process.argv[2] ?? '-19.9167'); // Belo Horizonte
const lng = Number(process.argv[3] ?? '-43.9345');
const radiusDeg = Number(process.argv[4] ?? '0.09'); // ~10km

// 1) Taxonomia: todas as categorias canônicas disponíveis
const listRes = await fetch(
  `https://api.mapbox.com/search/searchbox/v1/list/category?access_token=${encodeURIComponent(token)}`,
  { signal: AbortSignal.timeout(15_000) }
);
if (!listRes.ok) {
  console.log(`ERRO list/category: HTTP ${listRes.status}`);
  process.exit(1);
}
const listData = (await listRes.json()) as { listItems?: Array<{ canonical_id: string; name: string }> };
const items = listData.listItems ?? [];
console.log(`=== ${items.length} categorias canônicas ===`);
for (const it of items) console.log(`${it.canonical_id} — ${it.name}`);

// 2) Teste real: categoria food_and_drink perto do ponto
async function tryCategory(id: string) {
  const t0 = Date.now();
  const url =
    `https://api.mapbox.com/search/searchbox/v1/category/${id}` +
    `?proximity=${lng},${lat}&radius=${radiusDeg}&country=br&language=pt-BR&limit=25` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.log(`\n[${id}] HTTP ${res.status}`);
    return;
  }
  const data = (await res.json()) as {
    features?: Array<{
      properties?: {
        name?: string;
        address?: string;
        full_address?: string;
        poi_category_ids?: string[];
        metadata?: { phone?: string; website?: string };
        operational_status?: string;
      };
    }>;
  };
  const feats = data.features ?? [];
  let withPhone = 0;
  let withSite = 0;
  console.log(`\n=== [${id}] ${feats.length} resultados em ${Date.now() - t0}ms ===`);
  for (const f of feats.slice(0, 12)) {
    const p = f.properties ?? {};
    if (p.metadata?.phone) withPhone++;
    if (p.metadata?.website) withSite++;
    console.log(
      ` - ${p.name} | ${p.address ?? 'sem endereço'} | fone: ${p.metadata?.phone ?? '—'} | site: ${p.metadata?.website ?? '—'} | ${(p.poi_category_ids ?? []).join(',')}`
    );
  }
  console.log(`  → ${withPhone} com telefone, ${withSite} com site`);
}

await tryCategory('food_and_drink');
await tryCategory('restaurant');
