/**
 * Mapbox — geocodificação, tiles e BUSCA DE NEGÓCIOS (Search Box API).
 * Depende de MAPBOX_ACCESS_TOKEN no .env (raiz do projeto).
 * A busca de negócios usa /searchbox/v1/category (25 POIs por chamada,
 * proximidade + raio) — substitui o OpenStreetMap/Overpass em 13/nov.
 */

import type { FoundBusiness } from '@findme/shared';

const UA = 'FindMeProfit/0.1 (app local de prospecção)';

const NO_TOKEN =
  'Token do Mapbox ausente. Cole MAPBOX_ACCESS_TOKEN no .env (raiz do projeto) e reinicie o servidor.';

/**
 * Trava territorial do app: por enquanto, SÓ MINAS GERAIS.
 * Aplicada em 3 camadas — (1) aqui no geocoding do Mapbox (região declarada
 * pelo Mapbox OU ponto dentro da bounding box), (2) no ponto bruto de
 * GPS/mapa validado em search.ts e (3) na query do Overpass (área
 * ISO3166-2=BR-MG, em overpass.ts). Para expandir a cobertura, mude aqui,
 * em overpass.ts e no aviso da interface.
 */
export const MG_BBOX = { minLat: -23.0, maxLat: -14.1, minLng: -51.1, maxLng: -39.6 };
export const MG_LOCK_MESSAGE =
  'O app está travado em Minas Gerais por enquanto — use um endereço, CEP ou ponto dentro de MG.';

/** Ponto dentro da bounding box de MG (fallback quando o Mapbox não declara a região). */
export function isInMgPoint(lat: number, lng: number): boolean {
  return (
    lat >= MG_BBOX.minLat && lat <= MG_BBOX.maxLat && lng >= MG_BBOX.minLng && lng <= MG_BBOX.maxLng
  );
}

/** O contexto do Mapbox declara que o endereço é de MG? */
function regionIsMg(ctx: MapboxContext | undefined): boolean {
  const r = ctx?.region;
  return r?.region_code?.toUpperCase() === 'MG' || (r?.region_code_full ?? '').toUpperCase() === 'BR-MG';
}

export interface MapboxContext {
  /** Faixa de endereço: `address_number` = número, `street_name` = rua,
   * `name` = "Rua X 1234" (rua+número juntos, sem vírgula). */
  address?: { name?: string; address_number?: string; street_name?: string };
  place?: { name?: string };
  locality?: { name?: string };
  neighborhood?: { name?: string };
  street?: { name?: string };
  /** Estado — `region_code` vem como sigla ("MG"), `region_code_full` como "BR-MG". */
  region?: { name?: string; region_code?: string; region_code_full?: string };
  /** CEP. */
  postcode?: { name?: string };
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] }; // [lng, lat]
  properties: {
    feature_type?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    context?: MapboxContext;
  };
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

/** Token do .env (ou null). */
function rawToken(): string | null {
  const t = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  return t ? t : null;
}

let tokenCheck: { ok: boolean } | null = null;

/**
 * Devolve o token se ele for válido (valida uma vez com uma chamada barata).
 * Falha de rede não é cacheada — a próxima chamada tenta de novo.
 */
export async function mapboxTokenReady(): Promise<string | null> {
  const token = rawToken();
  if (!token) return null;
  if (tokenCheck) return tokenCheck.ok ? token : null;

  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=S%C3%A3o%20Paulo&limit=1&access_token=${encodeURIComponent(token)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) }
    );
    tokenCheck = { ok: res.ok };
    return res.ok ? token : null;
  } catch {
    return null;
  }
}

async function v6(path: 'forward' | 'reverse', params: Record<string, string>, token: string): Promise<MapboxResponse> {
  const qs = new URLSearchParams({ ...params, access_token: token, language: 'pt-BR' });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/${path}?${qs}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token do Mapbox inválido (HTTP 401). Confira o MAPBOX_ACCESS_TOKEN no .env.');
    throw new Error(`Mapbox geocoding HTTP ${res.status}`);
  }
  return (await res.json()) as MapboxResponse;
}

/**
 * Endereço em texto livre → ponto (modo "por endereço/cidade" da busca).
 * Aceita qualquer parte do endereço — rua, bairro, cidade ou CEP. O Mapbox
 * já vem restrito ao Brasil (country=br); aqui em cima, a trava MG pega o
 * PRIMEIRO resultado dentro de Minas Gerais e rejeita match de outro
 * estado (cidades mineiras com nome igual em outros estados, CEP de fora…).
 */
export async function mapboxGeocodeQuery(q: string, token: string) {
  const data = await v6(
    'forward',
    { q, country: 'br', limit: '5', types: 'address,street,postcode,place,locality,neighborhood' },
    token
  );
  for (const f of data.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (lat == null || lng == null) continue;
    if (!regionIsMg(f.properties.context) && !isInMgPoint(lat, lng)) continue;
    const ctx = f.properties.context ?? {};
    return {
      lat,
      lng,
      city: ctx.place?.name ?? ctx.locality?.name ?? null,
      neighborhood: ctx.neighborhood?.name ?? (ctx.place?.name ? (ctx.locality?.name ?? null) : null),
      label: f.properties.full_address ?? f.properties.name ?? q,
    };
  }
  throw new Error(
    `"${q}" não foi localizado em Minas Gerais. ${MG_LOCK_MESSAGE}`
  );
}

/** Endereço de negócio → coordenada (usado para posicionar pins).
 * Mesma trava MG: fora do estado, não geolocaliza (retorna null). */
export async function mapboxGeocodeAddress(address: string, city: string | null, token: string) {
  const q = [address, city].filter(Boolean).join(', ');
  const data = await v6('forward', { q, country: 'br', limit: '5', types: 'address,street' }, token);
  for (const f of data.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (lat == null || lng == null) continue;
    if (!regionIsMg(f.properties.context) && !isInMgPoint(lat, lng)) continue;
    return { lat, lng, label: f.properties.full_address ?? f.properties.name ?? q };
  }
  return null;
}

/** Coordenada → bairro/cidade (usado ao localizar o usuário). */
export async function mapboxReverse(lat: number, lng: number, token: string) {
  const data = await v6(
    'reverse',
    { longitude: String(lng), latitude: String(lat), limit: '1' },
    token
  );
  const f = (data.features ?? [])[0];
  const ctx = f?.properties.context ?? {};
  return {
    lat,
    lng,
    city: ctx.place?.name ?? ctx.locality?.name ?? null,
    neighborhood: ctx.neighborhood?.name ?? null,
    label: f?.properties.full_address ?? 'Sua localização',
  };
}

/** Coordenada → endereço completo (rua+num, bairro, cidade - UF, CEP).
 * Quando o reverse cai no meio da rua (feature street-level, sem número),
 * uma segunda chamada restrita a `address` acha a porta mais próxima —
 * com número e CEP completos. */
export async function mapboxReverseDetail(lat: number, lng: number, token: string) {
  const data = await v6('reverse', { longitude: String(lng), latitude: String(lat), limit: '1' }, token);
  const f = (data.features ?? [])[0];
  const ctx = f?.properties.context ?? {};

  let streetName = ctx.street?.name ?? ctx.address?.street_name ?? null;
  let number = ctx.address?.address_number ?? null;
  let postcode = ctx.postcode?.name ?? null;
  // Bairro: BH usa `neighborhood`, SP usa `locality` — só vale como bairro se
  // a cidade veio por `place` (senão a locality É a cidade).
  const neighborhood =
    ctx.neighborhood?.name ?? (ctx.place?.name ? (ctx.locality?.name ?? null) : null);
  const city = ctx.place?.name ?? ctx.locality?.name ?? null;
  const uf =
    ctx.region?.region_code || (ctx.region?.region_code_full ?? '').replace(/^BR-/i, '') || ctx.region?.name || null;

  // Porta mais próxima: número + CEP completos (o CEP de rua vem truncado)
  if (!number) {
    try {
      const near = await v6(
        'reverse',
        { longitude: String(lng), latitude: String(lat), types: 'address', limit: '1' },
        token
      );
      const nctx = (near.features ?? [])[0]?.properties.context;
      if (nctx?.address?.address_number) {
        streetName = nctx.address.street_name ?? streetName;
        number = nctx.address.address_number;
        postcode = nctx.postcode?.name ?? postcode;
      }
    } catch {
      // sem porta próxima — mantém o que a 1ª chamada trouxe
    }
  }

  // "Rua X, 1234" — sem duplicar a rua (address.name já vem como "Rua X 1234")
  const streetLine = streetName && number ? `${streetName}, ${number}` : (ctx.address?.name ?? streetName);
  const cityLine = city && uf ? `${city} - ${uf}` : (city ?? uf);
  const address = [streetLine, neighborhood, cityLine, postcode].filter(Boolean).join(', ') || null;

  return { address, postcode, city, neighborhood };
}

/** ===== Busca de negócios (Search Box API) ===== */

interface MapboxPoiProperties {
  name?: string;
  mapbox_id?: string;
  /** "R. da Bahia, 123" — número+rua quando conhecidos. */
  address?: string;
  full_address?: string;
  poi_category_ids?: string[];
  /** Distância até o proximity, em metros. */
  distance?: number;
  operational_status?: string;
  metadata?: { phone?: string; website?: string };
  context?: {
    region?: { name?: string; region_code?: string; region_code_full?: string };
    postcode?: { name?: string };
    place?: { name?: string };
    locality?: { name?: string };
    neighborhood?: { name?: string };
    street?: { name?: string };
  };
  coordinates?: { longitude?: number; latitude?: number };
}

interface MapboxPoiFeature {
  properties?: MapboxPoiProperties;
  geometry?: { coordinates?: [number, number] };
}

export interface PoiSearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  categories: Array<{ id: string; label: string; mapboxCategories: string[] }>;
  /** Máximo de resultados por categoria. */
  limit: number;
}

export interface PoiSearchResult {
  results: FoundBusiness[];
  withSite: number;
}

/**
 * Uma chamada /category/{id} (até 25 POIs ao redor do ponto). Com 1 retry
 * curto — falha isolada de rede não deve furar a busca inteira.
 */
async function categorySearch(
  catId: string,
  lat: number,
  lng: number,
  radiusDeg: number,
  token: string
): Promise<MapboxPoiFeature[]> {
  const qs = new URLSearchParams({
    proximity: `${lng},${lat}`,
    radius: String(Math.max(0.00001, Math.min(10, radiusDeg))),
    country: 'br',
    language: 'pt-BR',
    limit: '25',
    exclude_fields: 'photos,reviews',
    access_token: token,
  });
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
    try {
      const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/category/${catId}?${qs}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { features?: MapboxPoiFeature[] };
        return data.features ?? [];
      }
      lastStatus = res.status;
    } catch {
      lastStatus = 0;
    }
  }
  throw new Error(`Mapbox Search Box HTTP ${lastStatus || 'timeout'} (categoria ${catId})`);
}

/**
 * Busca negócios por categoria ao redor de um ponto — Search Box da Mapbox,
 * a fonte dos dados desde 13/nov (o Overpass/OpenStreetMap ficou de fora).
 * Cada sub-categoria da categoria app = 1 chamada /category (máx. 25 POIs);
 * todas rodam em paralelo (batches de 6) — busca completa em ~3-5s.
 */
export async function searchPois({
  lat,
  lng,
  radiusKm,
  categories,
  limit,
}: PoiSearchParams): Promise<PoiSearchResult> {
  const token = await mapboxTokenReady();
  if (!token) throw new Error(NO_TOKEN);

  // Raio em graus (1° ≈ 111 km) — o parâmetro do Mapbox é em graus
  const radiusDeg = radiusKm / 111;

  // Sub-categorias de todas as categorias selecionadas (máx. 4 cada)
  type Job = { catIdx: number; catId: string };
  const jobs: Job[] = [];
  categories.forEach((c, i) => {
    for (const id of c.mapboxCategories.slice(0, 4)) jobs.push({ catIdx: i, catId: id });
  });
  if (jobs.length === 0) return { results: [], withSite: 0 };

  // Batches de 6 em paralelo; falha em TODAS as chamadas = erro de verdade
  const byCat: MapboxPoiFeature[][] = categories.map(() => []);
  let okCalls = 0;
  let lastErr: unknown = null;
  for (let i = 0; i < jobs.length; i += 6) {
    const batch = jobs.slice(i, i + 6);
    const settled = await Promise.allSettled(
      batch.map((j) => categorySearch(j.catId, lat, lng, radiusDeg, token))
    );
    settled.forEach((s, k) => {
      if (s.status === 'fulfilled') {
        okCalls++;
        byCat[batch[k].catIdx].push(...s.value);
      } else {
        lastErr = s.reason;
      }
    });
  }
  if (okCalls === 0) {
    const cause = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`A busca na Mapbox falhou (${cause}). Tente novamente em instantes.`);
  }

  // Dedupe entre categorias/sub-categorias pelo mapbox_id (1ª categoria vence)
  const seen = new Set<string>();
  const results: FoundBusiness[] = [];
  let withSite = 0;

  categories.forEach((c, catIdx) => {
    const bucket: Array<{ found: FoundBusiness; dist: number }> = [];
    for (const f of byCat[catIdx]) {
      const p = f.properties ?? {};
      const name = p.name?.trim();
      if (!name || p.operational_status === 'closed') continue;
      if (p.mapbox_id && seen.has(p.mapbox_id)) continue;
      p.mapbox_id && seen.add(p.mapbox_id);

      // Coordenadas: properties.coordinates (doc) com fallback geometry
      const lngF = p.coordinates?.longitude ?? f.geometry?.coordinates?.[0];
      const latF = p.coordinates?.latitude ?? f.geometry?.coordinates?.[1];
      if (latF == null || lngF == null) continue;
      // Trava MG: nem perto de fronteira vaza resultado de fora do estado
      if (!isInMgPoint(latF, lngF)) continue;

      const ctx = p.context ?? {};
      const city = ctx.place?.name ?? ctx.locality?.name ?? null;
      const neighborhood = ctx.neighborhood?.name ?? (ctx.place?.name ? (ctx.locality?.name ?? null) : null);
      const uf = ctx.region?.region_code ?? null;
      const postcode = ctx.postcode?.name ?? null;

      const streetLine = p.address ?? ctx.street?.name ?? null;
      const cityLine = city && uf ? `${city} - ${uf}` : (city ?? uf);
      const address = [streetLine, neighborhood, cityLine, postcode].filter(Boolean).join(', ') || null;

      // metadata.website às vezes é o Instagram da página — para o app isso
      // é contato social, não site: vai para o campo instagram.
      const rawSite = p.metadata?.website ?? null;
      const isInstagram = rawSite != null && /instagram\.com/i.test(rawSite);
      const website = isInstagram ? null : rawSite;
      const instagram = isInstagram ? rawSite : null;

      bucket.push({
        found: {
          name,
          category: c.label,
          city,
          address,
          phone: p.metadata?.phone ?? null,
          website,
          instagram,
          lat: latF,
          lng: lngF,
        },
        dist: p.distance ?? haversineKmLocal(lat, lng, latF, lngF) * 1000,
      });
    }

    bucket.sort((a, b) => a.dist - b.dist);
    for (const { found } of bucket.slice(0, limit)) {
      if (found.website) withSite++;
      results.push(found);
    }
  });

  // Global: mais próximos primeiro e teto geral
  results.sort((a, b) => {
    const da = a.lat != null && a.lng != null ? haversineKmLocal(lat, lng, a.lat, a.lng) : Infinity;
    const db = b.lat != null && b.lng != null ? haversineKmLocal(lat, lng, b.lat, b.lng) : Infinity;
    return da - db;
  });
  return { results: results.slice(0, limit), withSite };
}

/** Haversine local (km) — só para ordenar quando o Mapbox não trouxe distance. */
function haversineKmLocal(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
