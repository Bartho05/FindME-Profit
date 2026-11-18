import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { SERVICES, PRICING_EXTRAS, type PricingEstimate, type Business } from '@findme/shared';
import { api, formatBRL } from '../api';
import { PageTitle, Card, inputClass, btnClass } from '../components/ui';

export default function Calculator() {
  const [serviceId, setServiceId] = useState(SERVICES[0]?.id ?? 'landing_page');
  const [pages, setPages] = useState(3);
  const [extras, setExtras] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [estimate, setEstimate] = useState<PricingEstimate | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Business[]>('/api/businesses').then(setBusinesses).catch(() => {});
  }, []);

  useEffect(() => {
    api<PricingEstimate>('/api/pricing/estimate', {
      method: 'POST',
      body: JSON.stringify({ serviceId, pages, extras, urgent }),
    })
      .then(setEstimate)
      .catch((e) => setError(e.message));
  }, [serviceId, pages, extras, urgent]);

  function toggleExtra(id: string) {
    setExtras((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createOpportunity() {
    setSaved(null);
    try {
      await api('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          businessId: Number(businessId),
          service: serviceId,
          estimatedValue: estimate?.suggested ?? 0,
        }),
      });
      setSaved('Oportunidade criada com o valor sugerido!');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <PageTitle
        title="Calculadora"
        subtitle="Precifique o site antes de falar com o cliente — faixa, fechamento e manutenção."
      />

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-base font-bold text-[#f0efe9]">Fatores</h3>

          <label className="mb-1 block text-sm text-[#8a8a83]">Tipo de serviço</label>
          <select className={`${inputClass} mb-4`} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {SERVICES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {formatBRL(s.min)} a {formatBRL(s.max)}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-sm text-[#8a8a83]">Número de páginas</label>
          <input
            className={`${inputClass} mb-4`}
            type="number"
            min={1}
            max={50}
            value={pages}
            onChange={(e) => setPages(Number(e.target.value) || 1)}
          />

          <label className="mb-2 block text-sm text-[#8a8a83]">Extras incluídos</label>
          <div className="mb-4 flex flex-col gap-2">
            {PRICING_EXTRAS.map((extra) => (
              <label key={extra.id} className="flex items-center gap-2 text-sm text-[#cfcdc6]">
                <input type="checkbox" checked={extras.includes(extra.id)} onChange={() => toggleExtra(extra.id)} />
                {extra.label} <span className="text-xs text-[#6f6f68]">(+{Math.round(extra.factor * 100)}%)</span>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-[#cfcdc6]">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Entrega urgente (até 7 dias) <span className="text-xs text-[#6f6f68]">(+25%)</span>
          </label>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Card de recomendação (bege, como o "premium" da referência) */}
          <div className="rounded-2xl bg-[#c9a882] p-5 text-[#171512] shadow-[0_4px_20px_rgba(201,168,130,0.2)]">
            <h3 className="mb-3 text-base font-bold">Recomendação</h3>
            {estimate ? (
              <>
                <p className="text-sm text-[#171512]/70">Faixa de preço</p>
                <p className="text-2xl font-bold">
                  {formatBRL(estimate.min)} – {formatBRL(estimate.max)}
                </p>
                <p className="mt-3 text-sm text-[#171512]/70">Valor sugerido de fechamento</p>
                <p className="text-4xl font-extrabold">{formatBRL(estimate.suggested)}</p>
                <p className="mt-3 text-xs text-[#171512]/80">
                  Manutenção mensal sugerida: <strong>{formatBRL(estimate.monthlyMaintenance)}/mês</strong> (receita recorrente)
                </p>
              </>
            ) : (
              <p className="text-[#171512]/70">Calculando…</p>
            )}
          </div>

          {estimate && (
            <Card className="p-5">
              <h3 className="mb-3 text-base font-bold text-[#f0efe9]">Como chegamos nesse valor</h3>
              <ul className="flex flex-col gap-1.5 text-sm text-[#cfcdc6]">
                {estimate.breakdown.length === 0 && <li className="text-[#6f6f68]">Apenas o valor base do serviço.</li>}
                {estimate.breakdown.map((b) => (
                  <li key={b.label}>
                    + {b.label} <span className="text-[#6f6f68]">(+{Math.round(b.delta * 100)}%)</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-3 text-base font-bold text-[#f0efe9]">Criar oportunidade com esse valor</h3>
            <select className={inputClass} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">Escolha o negócio…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button className={`${btnClass} mt-3 w-full`} disabled={!businessId} onClick={createOpportunity}>
              <Target size={15} />
              Criar no pipeline
            </button>
            {saved && <p className="mt-2 text-sm text-emerald-300">{saved}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
