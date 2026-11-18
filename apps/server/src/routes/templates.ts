import { Router } from 'express';
import { AVAILABLE_VARIABLES } from '@findme/shared';
import db from '../db/db.js';

export const templatesRouter = Router();

function rowToTemplate(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    content: row.content,
    createdAt: row.created_at,
  };
}

templatesRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY id').all() as Record<string, unknown>[];
  res.json(rows.map(rowToTemplate));
});

templatesRouter.post('/', (req, res) => {
  const t = req.body ?? {};
  if (!t.name || !t.content) {
    return res.status(400).json({ error: '"name" e "content" são obrigatórios' });
  }
  const channel = t.channel === 'email' ? 'email' : 'whatsapp';
  const result = db
    .prepare('INSERT INTO templates (name, channel, content) VALUES (?, ?, ?)')
    .run(String(t.name), channel, String(t.content));
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  res.status(201).json(rowToTemplate(row));
});

templatesRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Template não encontrado' });
  res.status(204).end();
});

// Variáveis disponíveis para usar nos templates
templatesRouter.get('/variables', (_req, res) => {
  res.json(AVAILABLE_VARIABLES);
});

// Preenche o template com os dados de um negócio (+ valor de uma oportunidade, se informada)
templatesRouter.post('/render', (req, res) => {
  const { templateId, businessId, opportunityId, valor } = req.body ?? {};
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(templateId)) as Record<string, unknown> | undefined;
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(businessId)) as Record<string, unknown> | undefined;
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado' });

  let serviceLabel: string | null = null;
  let value: number | null = null;
  if (opportunityId) {
    const opp = db.prepare('SELECT service, estimated_value FROM opportunities WHERE id = ?').get(Number(opportunityId)) as Record<string, unknown> | undefined;
    if (opp) {
      serviceLabel = String(opp.service);
      value = Number(opp.estimated_value) || null;
    }
  }

  const variables: Record<string, string> = {
    negocio: String(business.name),
    categoria: business.category ? String(business.category) : '',
    cidade: business.city ? String(business.city) : '',
    telefone: business.phone ? String(business.phone) : '',
    servico: serviceLabel ?? '',
    valor: value != null ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : String(valor ?? ''),
  };

  let rendered = String(template.content);
  for (const [key, val] of Object.entries(variables)) {
    rendered = rendered.split(`{{${key}}}`).join(val);
  }

  res.json({
    channel: template.channel,
    variables,
    message: rendered,
  });
});
