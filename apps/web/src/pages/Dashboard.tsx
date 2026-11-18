import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  ListChecks,
  MessagesSquare,
  Radar,
  Send,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { STATUS_LABELS, type Opportunity, type OpportunityStatus, type Stats } from '@findme/shared';
import { api, formatBRL } from '../api';
import { Card, STATUS_DOT } from '../components/ui';

const STATUS_ICONS: Record<OpportunityStatus, LucideIcon> = {
  prospect: Eye,
  contacted: Send,
  negotiating: MessagesSquare,
  won: CheckCircle2,
  lost: XCircle,
};

const STATUS_SHORT: Record<OpportunityStatus, string> = {
  prospect: 'Prosp.',
  contacted: 'Contat.',
  negotiating: 'Negoc.',
  won: 'Ganho',
  lost: 'Perdido',
};

/** "Sunburst" de raios ao redor do centro (como o card Working format da referência). */
function SpokeGauge({ pct, centerLabel, centerValue }: { pct: number; centerLabel: string; centerValue: string }) {
  const N = 60;
  const lit = Math.round((pct / 100) * N);
  const cx = 70;
  const cy = 70;
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0">
      {Array.from({ length: N }, (_, i) => {
        const angle = (i * 360) / N - 90;
        const rad = (angle * Math.PI) / 180;
        const r1 = 26;
        const r2 = i % 5 === 0 ? 52 : 44;
        const x1 = cx + r1 * Math.cos(rad);
        const y1 = cy + r1 * Math.sin(rad);
        const x2 = cx + r2 * Math.cos(rad);
        const y2 = cy + r2 * Math.sin(rad);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={i < lit ? '#4ade80' : '#2e2e2c'}
            strokeWidth={i < lit ? 2.4 : 2}
            strokeLinecap="round"
          />
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#f0efe9" fontSize="22" fontWeight="800">
        {centerValue}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#8a8a83" fontSize="9">
        {centerLabel}
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>('/api/stats')
      .then(setStats)
      .catch((e) => setError(e.message));
    api<Opportunity[]>('/api/opportunities')
      .then(setOpps)
      .catch(() => {});
  }, []);

  if (error) return <p className="text-rose-300">{error}</p>;
  if (!stats) return <p className="text-[#6f6f68]">Carregando…</p>;

  const maxBarValue = Math.max(1, ...stats.byStatus.map((s) => s.value));
  const maxBar = stats.byStatus.reduce((best, s) => (s.value > best.value ? s : best), stats.byStatus[0]);
  const withSite = Math.max(0, stats.businessesTotal - stats.businessesWithoutSite);
  const pctNoSite = stats.businessesTotal > 0 ? Math.round((stats.businessesWithoutSite / stats.businessesTotal) * 100) : 0;
  const pctWithSite = stats.businessesTotal > 0 ? Math.round((withSite / stats.businessesTotal) * 100) : 0;
  const recent = [...opps].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5);

  return (
    <div>
      {/* ---------- Cabeçalho ---------- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f2f1eb]">Bem-vindo de volta</h2>
          <p className="mt-1 text-sm text-[#8a8a83]">
            {stats.businessesTotal} negócios mapeados · {stats.opportunitiesOpen} oportunidades em andamento
          </p>
        </div>
        <Link
          to="/negocios"
          className="inline-flex items-center gap-2 rounded-full bg-[#c9a882] px-5 py-2.5 text-sm font-semibold text-[#171512] shadow-sm transition hover:bg-[#d8bc99]"
        >
          <Radar size={16} />
          Buscar novos leads
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ---------- Resumo (números grandes) ---------- */}
        <Card className="flex flex-col p-5 xl:col-span-4">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            ATIVO
          </span>
          <h3 className="mt-4 text-sm font-medium text-[#8a8a83]">Potencial de venda</h3>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-[#c9a882]">{formatBRL(stats.pipelineValue)}</p>
          <p className="mt-1 text-xs text-[#6f6f68]">valor somado das oportunidades abertas</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#2a2a28] bg-[#242423] p-4">
              <p className="text-3xl font-extrabold text-[#f0efe9]">{stats.businessesWithoutSite}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-[#8a8a83]">Negócios sem site</p>
            </div>
            <div className="rounded-xl border border-[#2a2a28] bg-[#242423] p-4">
              <p className="text-3xl font-extrabold text-[#f0efe9]">{stats.opportunitiesOpen}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-[#8a8a83]">Oportunidades abertas</p>
            </div>
          </div>

          <div className="mt-auto pt-5">
            <p className="flex items-center gap-2 text-xs text-[#8a8a83]">
              <TrendingUp size={14} className="text-[#4ade80]" />
              Valor ganho até agora: <span className="font-semibold text-[#4ade80]">{formatBRL(stats.wonValue)}</span>
            </p>
          </div>
        </Card>

        {/* ---------- Pipeline por fase (lista) ---------- */}
        <Card className="p-5 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-[#f0efe9]">
              <ListChecks size={17} className="text-[#c9a882]" />
              Pipeline por fase
            </h3>
            <span className="text-xs text-[#6f6f68]">contagem · valor</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {stats.byStatus.map((s) => {
              const Icon = STATUS_ICONS[s.status];
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2e2e2c] bg-[#262625] text-[#c9a882]">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#eceae4]">{STATUS_LABELS[s.status]}</p>
                    <p className="text-xs text-[#6f6f68]">{s.count} {s.count === 1 ? 'oportunidade' : 'oportunidades'}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#4ade80]">{formatBRL(s.value)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ---------- Cobertura (gauge) ---------- */}
        <Card className="flex flex-col items-center p-5 xl:col-span-3">
          <h3 className="mb-2 self-start text-base font-bold text-[#f0efe9]">Sem site</h3>
          <SpokeGauge pct={pctNoSite} centerValue={`${pctNoSite}%`} centerLabel="da sua base" />
          <div className="mt-4 w-full space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-[#242423] px-3 py-2">
              <span className="flex items-center gap-2 text-[#cfcdc6]">
                <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> Sem site
              </span>
              <span className="text-[#8a8a83]">{stats.businessesWithoutSite} · {pctNoSite}%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[#242423] px-3 py-2">
              <span className="flex items-center gap-2 text-[#cfcdc6]">
                <span className="h-2 w-2 rounded-full bg-[#5a5a55]" /> Com site
              </span>
              <span className="text-[#8a8a83]">{withSite} · {pctWithSite}%</span>
            </div>
          </div>
        </Card>

        {/* ---------- Valor por fase (barras) ---------- */}
        <Card className="p-5 xl:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#f0efe9]">Valor por fase</h3>
            <span className="text-xs text-[#6f6f68]">todo o pipeline</span>
          </div>
          <div className="flex h-44 items-end gap-3">
            {stats.byStatus.map((s) => {
              const h = Math.max(6, Math.round((s.value / maxBarValue) * 100));
              const isTop = s.status === maxBar.status && s.value > 0;
              return (
                <div key={s.status} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  {isTop && (
                    <span className="rounded-md border border-[#3a3a37] bg-[#262625] px-1.5 py-0.5 text-[10px] font-semibold text-[#c9a882]">
                      {formatBRL(s.value)}
                    </span>
                  )}
                  <div
                    className={`w-full max-w-10 rounded-t-md ${isTop ? 'bg-[#4ade80]' : 'bg-[#333330]'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3">
            {stats.byStatus.map((s) => (
              <span key={s.status} className="flex-1 text-center text-[11px] text-[#8a8a83]">
                {STATUS_SHORT[s.status]}
              </span>
            ))}
          </div>
        </Card>

        {/* ---------- Últimas oportunidades (timeline) ---------- */}
        <Card className="p-5 xl:col-span-5">
          <h3 className="mb-4 text-base font-bold text-[#f0efe9]">Últimas oportunidades</h3>
          <div className="flex flex-col">
            {recent.length === 0 && <p className="text-sm text-[#6f6f68]">Crie a primeira na página de oportunidades.</p>}
            {recent.map((o) => (
              <div key={o.id} className="flex items-center gap-3 border-b border-[#2a2a28] py-2.5 last:border-b-0">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[o.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#eceae4]">{o.businessName}</p>
                  <p className="text-xs text-[#6f6f68]">
                    {STATUS_LABELS[o.status]} · {o.updatedAt.slice(5, 10).replace('-', '/')}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#cfcdc6]">{formatBRL(o.estimatedValue)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ---------- Card premium (bege) ---------- */}
        <Card className="flex flex-col justify-between bg-[#c9a882] p-5 xl:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[#171512]">Encontre novos leads na sua região</h3>
              <p className="mt-0.5 text-sm text-[#171512]/70">
                GPS + raio ajustável no mapa: buscar no mapa → favoritar → precificar → fechar.
              </p>
            </div>
            <Link
              to="/negocios"
              className="inline-flex items-center gap-2 rounded-full bg-[#171512] px-5 py-2.5 text-sm font-semibold text-[#f0efe9] transition hover:bg-[#262623]"
            >
              <Radar size={15} />
              Abrir o mapa
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
