import { Router } from 'express';
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from '@findme/shared';
import db from '../db/db.js';

export const opportunitiesRouter = Router();

function rowToOpportunity(row: Record<string, unknown>) {
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    service: row.service,
    status: row.status as OpportunityStatus,
    estimatedValue: row.estimated_value,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_SQL = `
  SELECT o.*, b.name AS business_name
  FROM opportunities o
  JOIN businesses b ON b.id = o.business_id
`;

opportunitiesRouter.get('/', (req, res) => {
  const { status, businessId } = req.query as Record<string, string>;
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (businessId) {
    where.push('o.business_id = ?');
    params.push(Number(businessId));
  }
  const sql = `
    ${SELECT_SQL}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.updated_at DESC, o.id DESC
  `;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  res.json(rows.map(rowToOpportunity));
});

opportunitiesRouter.post('/', (req, res) => {
  const o = req.body ?? {};
  if (!o.businessId || !o.service) {
    return res.status(400).json({ error: '"businessId" e "service" são obrigatórios' });
  }
  const status: OpportunityStatus = OPPORTUNITY_STATUSES.includes(o.status) ? o.status : 'prospect';
  const business = db.prepare('SELECT id FROM businesses WHERE id = ?').get(Number(o.businessId));
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado' });

  const result = db
    .prepare(
      `INSERT INTO opportunities (business_id, service, status, estimated_value, notes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(Number(o.businessId), String(o.service), status, Number(o.estimatedValue) || 0, o.notes || null);

  const row = db.prepare(`${SELECT_SQL} WHERE o.id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  res.status(201).json(rowToOpportunity(row));
});

// Muda status (avança no pipeline)
opportunitiesRouter.patch('/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  if (!OPPORTUNITY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${OPPORTUNITY_STATUSES.join(', ')}` });
  }
  const result = db
    .prepare(`UPDATE opportunities SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  const row = db.prepare(`${SELECT_SQL} WHERE o.id = ?`).get(Number(req.params.id)) as Record<string, unknown>;
  res.json(rowToOpportunity(row));
});

// Registra uma interação (WhatsApp, e-mail, ligação, reunião)
opportunitiesRouter.post('/:id/interactions', (req, res) => {
  const { channel, direction = 'out', content } = req.body ?? {};
  if (!channel || !content) {
    return res.status(400).json({ error: '"channel" e "content" são obrigatórios' });
  }
  const opportunity = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(Number(req.params.id));
  if (!opportunity) return res.status(404).json({ error: 'Oportunidade não encontrada' });

  const result = db
    .prepare('INSERT INTO interactions (opportunity_id, channel, direction, content) VALUES (?, ?, ?, ?)')
    .run(Number(req.params.id), String(channel), direction === 'in' ? 'in' : 'out', String(content));
  db.prepare(`UPDATE opportunities SET updated_at = datetime('now') WHERE id = ?`).run(Number(req.params.id));

  const row = db.prepare('SELECT * FROM interactions WHERE id = ?').get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  res.status(201).json(row);
});

opportunitiesRouter.get('/:id/interactions', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM interactions WHERE opportunity_id = ? ORDER BY created_at DESC, id DESC')
    .all(Number(req.params.id)) as Record<string, unknown>[];
  res.json(rows);
});

opportunitiesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM interactions WHERE opportunity_id = ?').run(Number(req.params.id));
  const result = db.prepare('DELETE FROM opportunities WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Oportunidade não encontrada' });
  res.status(204).end();
});
