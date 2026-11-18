import { Router } from 'express';
import db from '../db/db.js';
import { parseCsv } from '../lib/csv.js';
import { rowToBusiness } from '../lib/search.js';
import { geocodeAddress, mergeFullAddress, needsFullAddress, reverseDetail } from '../lib/geocoding.js';

export const businessesRouter = Router();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Geocodifica um negócio pelo endereço e grava lat/lng no banco. */
async function geocodeAndSave(id: number, address: string, city: string | null): Promise<boolean> {
  const geo = await geocodeAddress(address, city);
  if (geo) {
    db.prepare('UPDATE businesses SET lat = ?, lng = ? WHERE id = ?').run(geo.lat, geo.lng, id);
  }
  return geo != null;
}

// Lista com filtros: q (busca), semSite=1, cidade, categoria
businessesRouter.get('/', (req, res) => {
  const { q, semSite, cidade, categoria } = req.query as Record<string, string>;
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    where.push('(name LIKE ? OR instagram LIKE ? OR phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (semSite === '1') where.push('has_website = 0');
  if (cidade) {
    where.push('city = ?');
    params.push(cidade);
  }
  if (categoria) {
    where.push('category = ?');
    params.push(categoria);
  }

  const sql = `
    SELECT * FROM businesses
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY favorite DESC, created_at DESC, id DESC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  res.json(rows.map(rowToBusiness));
});

businessesRouter.get('/cities', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT city FROM businesses WHERE city IS NOT NULL ORDER BY city').all() as Record<string, unknown>[];
  res.json(rows.map((r) => r.city));
});

businessesRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Negócio não encontrado' });
  res.json(rowToBusiness(row));
});

businessesRouter.post('/', (req, res) => {
  const b = req.body ?? {};
  if (!b.name || typeof b.name !== 'string') {
    return res.status(400).json({ error: 'O campo "name" é obrigatório' });
  }
  const result = db
    .prepare(
      `INSERT INTO businesses (name, category, city, address, phone, email, instagram, has_website, website_url, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
    )
    .run(
      b.name.trim(),
      b.category || null,
      b.city || null,
      b.address || null,
      b.phone || null,
      b.email || null,
      b.instagram || null,
      b.hasWebsite ? 1 : 0,
      b.websiteUrl || null
    );
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  // Pega as coordenadas em segundo plano (o pino aparece no mapa na próxima listagem)
  if (b.address) {
    void geocodeAndSave(Number(result.lastInsertRowid), String(b.address), (b.city as string) ?? null);
  }
  res.status(201).json(rowToBusiness(row));
});

// Importação em massa via texto CSV. Espera um cabeçalho com colunas
// como: name, category, city, address, phone, email, instagram, website_url
businessesRouter.post('/import', (req, res) => {
  const csv = String(req.body?.csv ?? '');
  if (!csv.trim()) return res.status(400).json({ error: 'Envie o conteúdo CSV em "csv"' });

  const records = parseCsv(csv);
  if (records.length === 0) return res.status(400).json({ error: 'CSV vazio ou sem linhas de dados' });

  const insert = db.prepare(
    `INSERT INTO businesses (name, category, city, address, phone, email, instagram, has_website, website_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv')`
  );

  let imported = 0;
  const inserted: Array<{ id: number; address: string; city: string | null }> = [];
  for (const r of records) {
    if (!r.name) continue;
    const website = r.website_url || r.website || '';
    const result = insert.run(
      r.name,
      r.category || null,
      r.city || null,
      r.address || null,
      r.phone || null,
      r.email || null,
      r.instagram || null,
      website ? 1 : 0,
      website || null
    );
    if (r.address) {
      inserted.push({ id: Number(result.lastInsertRowid), address: r.address, city: r.city ?? null });
    }
    imported++;
  }
  // Geocodifica os novos em segundo plano (1 req/s de cortesia)
  void (async () => {
    for (const item of inserted) {
      await geocodeAndSave(item.id, item.address, item.city);
      await delay(1_100);
    }
  })();
  res.status(201).json({ imported, skipped: records.length - imported });
});

// Completa dados de localização dos negócios salvos:
// 1) tem endereço e falta coordenada → Mapbox forward (posiciona no mapa)
// 2) tem coordenada e o endereço está sem CEP → Mapbox reverse (completa
//    rua, número, bairro, cidade, UF e CEP). Endereços digitados pelo
//    usuário (source manual/csv) não são alterados.
businessesRouter.post('/geocode-missing', async (_req, res, next) => {
  try {
    const rows = db
      .prepare('SELECT id, name, address, city FROM businesses WHERE lat IS NULL AND address IS NOT NULL ORDER BY id LIMIT 60')
      .all() as Array<{ id: number; name: string; address: string; city: string | null }>;

    let geocoded = 0;
    const failed: string[] = [];
    for (const r of rows) {
      const ok = await geocodeAndSave(r.id, r.address, r.city);
      if (ok) geocoded++;
      else failed.push(r.name);
      await delay(250);
    }

    // Passo 2: endereço completo com CEP (importados automaticamente) —
    // mescla: mantém rua/número/CEP do OSM, completa bairro/cidade-UF do Mapbox
    const incomplete = (
      db
        .prepare(
          "SELECT id, lat, lng, address, city FROM businesses WHERE lat IS NOT NULL AND lng IS NOT NULL AND source IN ('osm', 'mapbox', 'google') ORDER BY id LIMIT 60"
        )
        .all() as Array<{ id: number; lat: number; lng: number; address: string | null; city: string | null }>
    ).filter((b) => needsFullAddress(b.address));

    let enriched = 0;
    for (const b of incomplete) {
      const detail = await reverseDetail(b.lat, b.lng);
      const merged = mergeFullAddress(b.address, detail);
      if (merged && merged !== b.address) {
        db.prepare('UPDATE businesses SET address = ?, city = COALESCE(?, city) WHERE id = ?').run(
          merged,
          detail.city,
          b.id
        );
        enriched++;
      }
      await delay(250);
    }

    const remaining = (
      db.prepare('SELECT COUNT(*) AS n FROM businesses WHERE lat IS NULL AND address IS NOT NULL').get() as { n: number }
    ).n;
    res.json({ geocoded, enriched, failed, remaining });
  } catch (err) {
    next(err);
  }
});

// Favoritar/desfavoritar — favoritos persistem entre as buscas
businessesRouter.patch('/:id/favorite', (req, res) => {
  const { favorite } = req.body ?? {};
  const result = db
    .prepare('UPDATE businesses SET favorite = ? WHERE id = ?')
    .run(favorite ? 1 : 0, Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Negócio não encontrado' });
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(req.params.id)) as Record<string, unknown>;
  res.json(rowToBusiness(row));
});

businessesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM interactions WHERE opportunity_id IN (SELECT id FROM opportunities WHERE business_id = ?)').run(id);
  db.prepare('DELETE FROM opportunities WHERE business_id = ?').run(id);
  const result = db.prepare('DELETE FROM businesses WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Negócio não encontrado' });
  res.status(204).end();
});
