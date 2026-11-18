import { SEARCH_CATEGORIES, type FoundBusiness, type SearchProvider, type Business } from '@findme/shared';
import db from '../db/db.js';
import {
  geocodeArea,
  mergeFullAddress,
  needsFullAddress,
  reverseDetail,
  reverseGeocode,
  type GeoPoint,
} from './geocoding.js';
import { searchPois } from './providers/mapbox.js';
import { isInMgPoint, MG_LOCK_MESSAGE } from './providers/mapbox.js';

export function rowToBusiness(row: Record<string, unknown>): Business {
  return {
    id: Number(row.id),
    name: String(row.name),
    category: row.category != null ? String(row.category) : null,
    city: row.city != null ? String(row.city) : null,
    address: row.address != null ? String(row.address) : null,
    phone: row.phone != null ? String(row.phone) : null,
    email: row.email != null ? String(row.email) : null,
    instagram: row.instagram != null ? String(row.instagram) : null,
    hasWebsite: Boolean(row.has_website),
    websiteUrl: row.website_url != null ? String(row.website_url) : null,
    source: row.source != null ? String(row.source) : null,
    favorite: Boolean(row.favorite),
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    createdAt: String(row.created_at),
  };
}

export interface RunSearchParams {
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  categories?: string[];
  limit?: number;
  /** Ignorado (mantido por compatibilidade) — o único provedor é o Mapbox. */
  provider?: 'auto' | SearchProvider;
}

export interface RunSearchResult {
  provider: SearchProvider;
  city: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  categories: string[];
  found: number;
  withSite: number;
  alreadyImported: number;
  imported: Business[];
  notes: string[];
}

export async function runSearch(params: RunSearchParams): Promise<RunSearchResult> {
  const notes: string[] = [];
  const radiusKm = Math.max(1, Math.min(20, params.radiusKm ?? 5));
  const limit = Math.max(1, Math.min(60, params.limit ?? 30));

  // Categorias
  const selectedIds = params.categories?.filter(Boolean) ?? [];
  const categories = selectedIds.length
    ? (SEARCH_CATEGORIES.filter((c) => selectedIds.includes(c.id)))
    : SEARCH_CATEGORIES;
  if (categories.length === 0) throw new Error('Categoria inválida. Use: ' + SEARCH_CATEGORIES.map((c) => c.id).join(', '));
  const categoryById = new Map(SEARCH_CATEGORIES.map((c) => [c.id, c]));

  // Resolve localização
  let lat = params.lat;
  let lng = params.lng;
  let city: string | null = params.city?.trim() || null;
  let neighborhood: string | null = null;

  // Localização por texto livre: cidade, bairro, rua ou CEP — o Mapbox
  // resolve qualquer uma das partes do endereço.
  if (city) {
    const geo = await geocodeArea(city);
    lat = geo.lat;
    lng = geo.lng;
    city = geo.city ?? city;
  } else if (lat != null && lng != null) {
    // Ponto bruto (GPS do navegador ou clique no mapa): trava MG — sem isso,
    // um clique fora do estado viraria busca em outro lugar do mapa.
    if (!isInMgPoint(lat, lng)) {
      throw new Error(MG_LOCK_MESSAGE);
    }
    try {
      const geo: GeoPoint = await reverseGeocode(lat, lng);
      city = geo.city;
      neighborhood = geo.neighborhood;
    } catch {
      notes.push('Não consegui identificar o bairro/cidade do ponto (a busca continua pelo raio).');
    }
  }
  if (lat == null || lng == null) {
    throw new Error('Informe a cidade OU permita o uso da localização no navegador.');
  }

  // Busca: Search Box da Mapbox (categoria + raio) — fonte dos dados de
  // negócios desde 13/nov; o Overpass/OpenStreetMap ficou de fora.
  const search = await searchPois({ lat: lat!, lng: lng!, radiusKm, categories, limit });

  if (search.results.length === 0) {
    notes.push('Nada encontrado nesse raio — aumente o raio ou marque outras categorias.');
  }

  // Endereço completo (com CEP): quem o OSM deixou sem endereço, sem CEP ou
  // sem bairro/UF recebe o detalhe do Mapbox — em mescla, preservando rua,
  // número e CEP do OSM (até 5 consultas em paralelo).
  const lackingFull = search.results.filter(
    (r) => r.lat != null && r.lng != null && needsFullAddress(r.address)
  );
  for (let i = 0; i < lackingFull.length; i += 5) {
    await Promise.all(
      lackingFull.slice(i, i + 5).map(async (r) => {
        const detail = await reverseDetail(r.lat!, r.lng!);
        r.address = mergeFullAddress(r.address, detail) ?? r.address;
        if (!r.city && detail.city) r.city = detail.city;
      })
    );
  }

  // Deduplica contra o banco e importa TODOS os achados (com e sem site) —
  // quem tem site registrado no OSM já vem marcado; a verificação final
  // é manual. Antes disso: remove negócios de buscas anteriores que não
  // são favoritos e não fazem parte do pipeline — assim a lista reflete
  // a busca atual. (Só roda depois de uma busca BEM-SUCEDIDA: se o
  // Overpass falhar, o throw acima aborta antes e a lista fica intacta.)
  const cleaned = db
    .prepare(
      `DELETE FROM businesses
       WHERE favorite = 0 AND source IN ('osm', 'google', 'mapbox')
         AND id NOT IN (SELECT DISTINCT business_id FROM opportunities)`
    )
    .run();
  if (cleaned.changes > 0) {
    notes.push(`${Number(cleaned.changes)} negócios da busca anterior saíram da lista (favoritos e oportunidades foram mantidos).`);
  }

  const checkByName = city
    ? db.prepare('SELECT id FROM businesses WHERE lower(trim(name)) = lower(trim(?)) AND city = ?')
    : db.prepare('SELECT id FROM businesses WHERE lower(trim(name)) = lower(trim(?))');
  const checkByPhone = db.prepare("SELECT id FROM businesses WHERE phone = ? AND phone != ''");

  const insert = db.prepare(
    `INSERT INTO businesses (name, category, city, address, phone, email, instagram, has_website, website_url, source, lat, lng)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
  );

  const imported: Business[] = [];
  let alreadyImported = 0;

  for (const found of search.results as FoundBusiness[]) {
    if (!found.name) continue;
    const categoryLabel = found.category ?? categoryById.get(selectedIds[0] ?? '')?.label ?? null;

    const byName = city
      ? checkByName.get(found.name, city)
      : checkByName.get(found.name);
    const byPhone = found.phone ? checkByPhone.get(found.phone) : undefined;
    if (byName || byPhone) {
      alreadyImported++;
      continue;
    }

    const hasSite = Boolean(found.website);
    const result = insert.run(
      found.name,
      categoryLabel,
      found.city,
      found.address,
      found.phone,
      found.instagram,
      hasSite ? 1 : 0,
      hasSite ? found.website : null,
      'mapbox',
      found.lat,
      found.lng
    );
    const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    imported.push(rowToBusiness(row));
  }

  return {
    provider: 'mapbox',
    city,
    neighborhood,
    lat: lat!,
    lng: lng!,
    radiusKm,
    categories: categories.map((c) => c.id),
    found: search.results.length,
    withSite: search.withSite,
    alreadyImported,
    imported,
    notes,
  };
}
