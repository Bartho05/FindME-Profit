import { SERVICES, PRICING_EXTRAS, type PricingFactors, type PricingEstimate, type PricingBreakdownItem } from '@findme/shared';

/**
 * Estimativa simples de preço: faixa base do serviço × fatores.
 * Retorna mínimo, máximo, valor sugerido (ponto médio) e o detalhamento.
 */
export function estimate(factors: PricingFactors): PricingEstimate {
  const service = SERVICES.find((s) => s.id === factors.serviceId) ?? SERVICES[0];

  const breakdown: PricingBreakdownItem[] = [];
  let factor = 1;

  // Páginas extras (relevante para site institucional/profissional)
  const basePages = service.id === 'site_institucional' || service.id === 'site_profissional' ? 3 : 1;
  const extraPages = Math.max(0, factors.pages - basePages);
  if (extraPages > 0) {
    const pageFactor = extraPages * 0.08;
    factor += pageFactor;
    breakdown.push({ label: `${extraPages} página(s) extra(s)`, delta: pageFactor });
  }

  // Extras
  for (const extra of PRICING_EXTRAS) {
    if (factors.extras.includes(extra.id)) {
      factor += extra.factor;
      breakdown.push({ label: extra.label, delta: extra.factor });
    }
  }

  // Urgência
  if (factors.urgent) {
    factor += 0.25;
    breakdown.push({ label: 'Entrega urgente (até 7 dias)', delta: 0.25 });
  }

  const min = Math.round((service.min * factor) / 10) * 10;
  const max = Math.round((service.max * factor) / 10) * 10;
  const suggested = Math.round(((min + max) / 2) / 10) * 10;

  // Manutenção mensal sugerida: ~1,5% do valor central, mínimo R$ 80.
  const monthlyMaintenance = Math.max(80, Math.round((suggested * 0.015) / 10) * 10);

  return { min, max, suggested, monthlyMaintenance, breakdown };
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
