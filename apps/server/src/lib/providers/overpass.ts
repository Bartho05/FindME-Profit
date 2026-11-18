/**
 * OpenStreetMap (Overpass) — provider LEGADO, fora do fluxo desde 13/nov.
 * Substituído pela Search Box da Mapbox (providers/mapbox.ts, função
 * searchPois): estável, com telefone e site dos POIs, e sem as quedas
 * diárias do Overpass. Mantido aqui apenas como plano B — para voltar
 * a usar, aponte search.ts para searchOsm de novo.
 */

import type { FoundBusiness, SearchCategory } from '@findme/shared';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const UA = 'FindMeProfit/0.1 (app local de prospecção)';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fica com a primeira promise que resolve; rejeita só quando TODAS falharem. */
function firstSuccess<T>(jobs: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let pending = jobs.length;
    let settled = false;
    let lastErr: unknown = null;
    for (const job of jobs) {
      job.then(
        (value) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        },
        (err) => {
          lastErr = err;
          if (--pending === 0 && !settled) reject(lastErr);
        }
      );
    }
  });
}

async function attemptEndpoint(url: string, query: string): Promise<OverpassResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as OverpassResponse;
  if (!Array.isArray(data.elements)) throw new Error('Overpass respondeu formato inesperado');
  return data;
}

/**
 * Hedged request: dispara a query em TODOS os espelhos ao mesmo tempo e
 * usa o primeiro que responder bem — espelho morto/travado não atrasa a
 * busca. Todos falharem? Espera 3s (sobrecarga passa em instantes) e faz
 * uma segunda rodada antes de reportar o erro.
 */
async function overpassRequest(query: string): Promise<OverpassResponse> {
  let lastErr: unknown = null;
  for (let round = 0; round < 2; round++) {
    if (round > 0) await sleep(3000);
    try {
      return await firstSuccess(ENDPOINTS.map((url) => attemptEndpoint(url, query)));
    } catch (err) {
      lastErr = err;
    }
  }
  // Causa técnica fica no log do servidor; para a interface vai mensagem
  // clara — o TimeoutError cru do fetch virava "Erro interno no servidor".
  console.error('Overpass: todos os', ENDPOINTS.length, 'espelhos falharam —', lastErr);
  throw new Error(
    'O OpenStreetMap (Overpass) está fora do ar agora (todos os espelhos falharam). Tente novamente em alguns minutos.'
  );
}

export interface OsmSearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  categories: SearchCategory[];
  defaultCity: string | null;
  /** Máximo de resultados por categoria. */
  limit: number;
}

export interface OsmSearchResult {
  /** Todos os negócios encontrados (com e sem site), mais próximos primeiro. */
  results: FoundBusiness[];
  /** Quantos dos achados têm site registrado nas tags do OSM. */
  withSite: number;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/** Distância em km (haversine) — para ordenar os mais próximos primeiro. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Monta a query Overpass: união dos filtros ao redor do ponto, travada na
 * área de MINAS GERAIS (ISO3166-2=BR-MG) — nem raio encostando em fronteira
 * de estado vaza resultado de fora. Trava parte do conjunto MG_LOCK (ver
 * providers/mapbox.ts); para expandir a cobertura, mude aqui junto. */
function buildQuery(filters: string[], lat: number, lng: number, radiusM: number): string {
  const union = filters
    .flatMap((f) => [`node${f}(area.mg)(around:${radiusM},${lat},${lng});`, `way${f}(area.mg)(around:${radiusM},${lat},${lng});`])
    .join('\n  ');
  return `[out:json][timeout:25];\narea["ISO3166-2"="BR-MG"]->.mg;\n(\n  ${union}\n);\nout center tags;`;
}

function firstTag(tags: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = tags[k]?.trim();
    if (v) return v;
  }
  return null;
}

/** Converte um filtro OQL `["k"="v"]` (ou vários pares no mesmo filtro)
 * em pares chave-valor para classificar os elementos pelas tags. */
function filterPairs(filter: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const re = /"([^"]+)"="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) != null) pairs.push([m[1], m[2]]);
  return pairs;
}

export async function searchOsm({
  lat,
  lng,
  radiusKm,
  categories,
  defaultCity,
  limit,
}: OsmSearchParams): Promise<OsmSearchResult> {
  const radiusM = Math.round(radiusKm * 1000);

  // UMA query combinada com todos os filtros (em vez de uma por categoria —
  // até 10 requests em paralelo, que é o que dispara sobrecarga/429). A
  // categoria de cada elemento é classificada aqui, pelas tags.
  const filtersByCat = categories.map((c) => c.osmFilters.slice(0, 4));
  const allFilters = [...new Set(filtersByCat.flat())];
  const pairsByCat = filtersByCat.map((filters) => filters.map(filterPairs));

  const data = await overpassRequest(buildQuery(allFilters, lat, lng, radiusM));

  // Elementos por categoria, com distância para ordenar
  const buckets: Array<Array<{ found: FoundBusiness; distance: number }>> = categories.map(() => []);

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const name = firstTag(tags, ['name', 'brand', 'operator']);
    if (!name) continue;

    const position = el.type === 'node' ? { lat: el.lat, lng: el.lon } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;
    if (!position?.lat || !position?.lng) continue;

    // Primeira categoria cujo filtro casa com as tags do elemento
    const catIdx = pairsByCat.findIndex((filters) =>
      filters.some((pairs) => pairs.every(([k, v]) => tags[k] === v))
    );
    if (catIdx === -1) continue;

    const website = firstTag(tags, ['website', 'contact:website']);
    const phone = firstTag(tags, ['phone', 'contact:phone']);
    const instagram = firstTag(tags, ['contact:instagram', 'instagram']);

    const houseNumber = tags['addr:housenumber'];
    const street = tags['addr:street'];
    const suburb = firstTag(tags, ['addr:suburb', 'addr:neighbourhood']);
    const cityTag = tags['addr:city'] ?? defaultCity;
    const stateTag = tags['addr:state'];
    const postcode = tags['addr:postcode'];

    // Endereço completo: "Rua X, 123, Bairro, São Paulo - SP, 01310-100"
    const streetLine = street && houseNumber ? `${street}, ${houseNumber}` : (street ?? houseNumber ?? null);
    const cityLine = cityTag && stateTag ? `${cityTag} - ${stateTag}` : (cityTag ?? stateTag ?? null);
    const address = [streetLine, suburb, cityLine, postcode].filter(Boolean).join(', ') || null;

    buckets[catIdx].push({
      found: {
        name,
        category: categories[catIdx].label,
        city: cityTag,
        address,
        phone,
        website,
        instagram,
        lat: position.lat,
        lng: position.lng,
      },
      distance: haversineKm(lat, lng, position.lat, position.lng),
    });
  }

  // Por categoria: mais próximos primeiro, teto de resultados
  const results: FoundBusiness[] = [];
  let withSite = 0;
  for (const bucket of buckets) {
    bucket.sort((a, b) => a.distance - b.distance);
    for (const { found } of bucket.slice(0, limit)) {
      if (found.website) withSite++;
      results.push(found);
    }
  }

  // Global: mais próximos primeiro e teto geral
  results.sort((a, b) => haversineKm(lat, lng, a.lat!, a.lng!) - haversineKm(lat, lng, b.lat!, b.lng!));
  return { results: results.slice(0, limit), withSite };
}
