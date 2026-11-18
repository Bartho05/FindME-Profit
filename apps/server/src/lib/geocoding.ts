/** Geocodificação — 100% Mapbox (único provedor de localização do app). */

import {
  mapboxTokenReady,
  mapboxGeocodeQuery as mbQuery,
  mapboxGeocodeAddress as mbAddress,
  mapboxReverse as mbReverse,
  mapboxReverseDetail as mbReverseDetail,
} from './providers/mapbox.js';

export interface GeoPoint {
  lat: number;
  lng: number;
  city: string | null;
  /** Bairro/subdistrito (quando conseguimos identificar). */
  neighborhood: string | null;
  label: string;
}

export interface GeoCoords {
  lat: number;
  lng: number;
  label: string;
}

const NO_TOKEN =
  'Token do Mapbox ausente. Cole MAPBOX_ACCESS_TOKEN no .env (raiz do projeto) e reinicie o servidor.';

/** Endereço em texto livre → ponto. Aceita rua, bairro, cidade ou CEP —
 * o Mapbox escolhe o melhor match entre todos os tipos de endereço. */
export async function geocodeArea(q: string): Promise<GeoPoint> {
  const token = await mapboxTokenReady();
  if (!token) throw new Error(NO_TOKEN);
  return mbQuery(q, token);
}

/** Normaliza endereços no formato OSM ("116, Rua Tietê" → "Rua Tietê, 116"). */
function normalizeAddress(address: string): string {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d+[a-zA-Z]?$/.test(parts[0])) {
    const [num, street, ...rest] = parts;
    return [street, num, ...rest].join(', ');
  }
  return parts.join(', ');
}

/** Geocodifica um endereço de negócio (rua + cidade). Retorna null se não encontrar. */
export async function geocodeAddress(address: string, city: string | null): Promise<GeoCoords | null> {
  const q = [normalizeAddress(address), city].filter(Boolean).join(', ');
  if (!q) return null;

  const token = await mapboxTokenReady();
  if (!token) return null;
  try {
    const mb = await mbAddress(q, null, token);
    if (mb) return { lat: mb.lat, lng: mb.lng, label: mb.label };
  } catch {
    // endereço vago/erro de rede — retorna null sem quebrar o fluxo
  }
  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoPoint> {
  const token = await mapboxTokenReady();
  if (!token) throw new Error(NO_TOKEN);
  return mbReverse(lat, lng, token);
}

/** Endereço completo (com CEP) a partir de coordenadas — completa os
 * negócios que o OSM trouxe sem endereço. Falha → tudo null (sem quebrar). */
export async function reverseDetail(lat: number, lng: number): Promise<{
  address: string | null;
  postcode: string | null;
  city: string | null;
  neighborhood: string | null;
}> {
  const empty = { address: null, postcode: null, city: null, neighborhood: null };
  const token = await mapboxTokenReady();
  if (!token) return empty;
  try {
    return await mbReverseDetail(lat, lng, token);
  } catch {
    return empty;
  }
}

/** Fim "Cidade - UF" no segmento da cidade. */
const CITY_UF_TAIL = / - [A-Z]{2}$/;
/** " - UF" em qualquer lugar do endereço ("…, São Paulo - SP, 01310-100"). */
const HAS_UF = / - [A-Z]{2}(?:,|$)/;
/** CEP completo ("01310-100") ou prefixo de rua ("01310", o Mapbox trunca
 * o CEP quando o reverse cai no meio da rua). */
const PART_CEP = /^\d{5}(?:-\d{3})?$/;

export interface AddressDetail {
  address: string | null;
  postcode: string | null;
  city: string | null;
  neighborhood: string | null;
}

/** O endereço precisa de detalhe (Mapbox)? — sem endereço, sem CEP (mesmo
 * prefixo de rua) ou sem a UF depois da cidade. */
export function needsFullAddress(address: string | null): boolean {
  if (!address) return true;
  return !PART_CEP.test(address) || !HAS_UF.test(address);
}

interface AddressParts {
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  cityLine: string | null; // "Cidade - UF" ou "Cidade"
  postcode: string | null;
}

/** Quebra "Rua X, 123, Bairro, Cidade - UF, 00000-000" em partes. */
function parseAddressLine(line: string | null, cityHint: string | null): AddressParts {
  const p: AddressParts = { street: null, number: null, neighborhood: null, cityLine: null, postcode: null };
  const segs = (line ?? '')
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length && PART_CEP.test(segs[segs.length - 1])) p.postcode = segs.pop()!;
  if (segs.length && CITY_UF_TAIL.test(segs[segs.length - 1])) p.cityLine = segs.pop()!;
  else if (segs.length && cityHint && segs[segs.length - 1] === cityHint) p.cityLine = segs.pop()!;
  // Número: segmento seguinte à rua começando com dígito ("1471 L2" conta)
  if (segs.length >= 2 && /^\d/.test(segs[1])) {
    p.number = segs[1];
    segs.splice(1, 1);
  }
  p.street = segs[0] ?? null;
  p.neighborhood = segs[1] ?? null;
  return p;
}

/** Junta o endereço que o OSM trouxe (rua, número, CEP — mais precisos) com
 * o detalhe do Mapbox (bairro, cidade - UF). Formato final:
 * "Rua X, 123, Bairro, Cidade - UF, 00000-000". */
export function mergeFullAddress(current: string | null, detail: AddressDetail): string | null {
  if (!current && !detail.address) return null;
  const osm = parseAddressLine(current, detail.city);
  const mb = parseAddressLine(detail.address, detail.city);

  const number = osm.number ?? mb.number;
  // Rua e número formam um par da MESMA fonte: quando o OSM não tem número,
  // a rua vem da porta mais próxima do Mapbox (o número pertence a ela).
  const streetUsed = osm.number ? osm.street : mb.number ? mb.street : (osm.street ?? mb.street);
  const neighborhood =
    [osm.neighborhood, mb.neighborhood, detail.neighborhood].find(
      (n) => n && n !== streetUsed && n !== detail.city
    ) ?? null;

  let cityLine = osm.cityLine ?? mb.cityLine ?? detail.city;
  if (cityLine && !CITY_UF_TAIL.test(cityLine)) {
    const uf = (CITY_UF_TAIL.exec(mb.cityLine ?? '')?.[0] ?? '').slice(3);
    if (uf) cityLine = `${cityLine} - ${uf}`;
  }
  // CEP completo vence o truncado (o reverse no meio da rua vem "01310")
  const fullCep = (v: string | null) => (v && /^\d{5}-\d{3}$/.test(v) ? v : null);
  const postcode =
    fullCep(osm.postcode) ?? fullCep(mb.postcode) ?? fullCep(detail.postcode) ?? osm.postcode ?? mb.postcode;

  const parts = [
    streetUsed && number ? `${streetUsed}, ${number}` : streetUsed,
    neighborhood,
    cityLine,
    postcode,
  ].filter((v): v is string => Boolean(v));
  return [...new Set(parts)].join(', ') || null;
}
