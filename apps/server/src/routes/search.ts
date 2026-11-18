import { Router } from 'express';
import { SEARCH_CATEGORIES, type SearchMeta } from '@findme/shared';
import { runSearch, type RunSearchParams } from '../lib/search.js';
import { reverseGeocode } from '../lib/geocoding.js';
import { mapboxTokenReady } from '../lib/providers/mapbox.js';

export const searchRouter = Router();

// Endereço aproximado a partir de coordenadas (usado ao localizar o usuário no mapa)
searchRouter.get('/reverse', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Envie lat e lng válidos' });
    }
    const geo = await reverseGeocode(lat, lng);
    res.json({ lat, lng, city: geo.city, neighborhood: geo.neighborhood, label: geo.label });
  } catch (err) {
    next(err);
  }
});

// Metadados: categorias + token público do Mapbox (pk.* — seguro no navegador)
searchRouter.get('/meta', async (_req, res, next) => {
  try {
    const mapboxToken = await mapboxTokenReady();
    const meta: SearchMeta = {
      provider: 'mapbox',
      mapboxEnabled: Boolean(mapboxToken),
      mapboxToken,
      categories: SEARCH_CATEGORIES,
    };
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

// Busca automática: encontra negócios sem site e importa direto para o app
searchRouter.post('/businesses', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as RunSearchParams;
    const result = await runSearch({
      city: body.city,
      lat: body.lat != null ? Number(body.lat) : undefined,
      lng: body.lng != null ? Number(body.lng) : undefined,
      radiusKm: body.radiusKm != null ? Number(body.radiusKm) : undefined,
      categories: Array.isArray(body.categories) ? body.categories.map(String) : undefined,
      limit: body.limit != null ? Number(body.limit) : undefined,
      provider: body.provider,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
