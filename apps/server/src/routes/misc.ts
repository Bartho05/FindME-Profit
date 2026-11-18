import { Router } from 'express';
import { SERVICES, PRICING_EXTRAS, OPPORTUNITY_STATUSES } from '@findme/shared';
import db from '../db/db.js';
import { estimate } from '../lib/pricing.js';

export const miscRouter = Router();

// Calculadora de preço
miscRouter.post('/pricing/estimate', (req, res) => {
  const body = req.body ?? {};
  const factors = {
    serviceId: String(body.serviceId ?? 'landing_page'),
    pages: Math.max(1, Math.min(50, Number(body.pages) || 1)),
    extras: Array.isArray(body.extras)
      ? body.extras.filter((e: unknown) => PRICING_EXTRAS.some((p) => p.id === e))
      : [],
    urgent: Boolean(body.urgent),
  };
  res.json(estimate(factors));
});

// Catálogo de serviços (para o frontend montar a calculadora)
miscRouter.get('/services', (_req, res) => {
  res.json(SERVICES);
});

// Dashboard: métricas resumidas
miscRouter.get('/stats', (_req, res) => {
  const businessesTotal = (db.prepare('SELECT COUNT(*) AS c FROM businesses').get() as { c: number }).c;
  const businessesWithoutSite = (
    db.prepare('SELECT COUNT(*) AS c FROM businesses WHERE has_website = 0').get() as { c: number }
  ).c;

  const byStatusRows = db
    .prepare('SELECT status, COUNT(*) AS count, COALESCE(SUM(estimated_value), 0) AS value FROM opportunities GROUP BY status')
    .all() as { status: string; count: number; value: number }[];

  const byStatusMap = new Map(byStatusRows.map((r) => [r.status, r]));
  const byStatus = OPPORTUNITY_STATUSES.map((status) => {
    const row = byStatusMap.get(status);
    return { status, count: row?.count ?? 0, value: row?.value ?? 0 };
  });

  const openStatuses = ['prospect', 'contacted', 'negotiating'];
  const opportunitiesOpen = byStatus
    .filter((s) => openStatuses.includes(s.status))
    .reduce((acc, s) => acc + s.count, 0);
  const pipelineValue = byStatus
    .filter((s) => openStatuses.includes(s.status))
    .reduce((acc, s) => acc + s.value, 0);
  const wonValue = byStatus.find((s) => s.status === 'won')?.value ?? 0;

  res.json({
    businessesTotal,
    businessesWithoutSite,
    opportunitiesOpen,
    pipelineValue,
    wonValue,
    byStatus,
  });
});
