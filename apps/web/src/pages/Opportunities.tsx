import { useCallback, useEffect, useState } from 'react';
import { OPPORTUNITY_STATUSES, SERVICES, STATUS_LABELS, CHANNEL_LABELS, type Opportunity, type OpportunityStatus, type Business, type Interaction, type InteractionChannel } from '@findme/shared';
import { Check, Plus } from 'lucide-react';
import { api, formatBRL } from '../api';
import { PageTitle, Card, inputClass, btnClass, StatusBadge, STATUS_DOT } from '../components/ui';

const STATUS_HEX: Record<OpportunityStatus, string> = {
  prospect: '#9ca3af',
  contacted: '#38bdf8',
  negotiating: '#fbbf24',
  won: '#4ade80',
  lost: '#fb7185',
};

export default function Opportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ businessId: '', service: SERVICES[0]?.id ?? 'landing_page', estimatedValue: '', notes: '' });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [interactions, setInteractions] = useState<Record<number, Interaction[]>>({});
  const [contact, setContact] = useState({ channel: 'whatsapp' as InteractionChannel, content: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Opportunity[]>('/api/opportunities');
      setOpportunities(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    api<Business[]>('/api/businesses').then(setBusinesses).catch(() => {});
  }, [load]);

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          businessId: Number(form.businessId),
          service: form.service,
          estimatedValue: Number(form.estimatedValue) || 0,
          notes: form.notes,
        }),
      });
      setForm({ businessId: '', service: SERVICES[0]?.id ?? 'landing_page', estimatedValue: '', notes: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function changeStatus(id: number, status: OpportunityStatus) {
    await api(`/api/opportunities/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  async function openDetail(id: number) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    try {
      const data = await api<Interaction[]>(`/api/opportunities/${id}/interactions`);
      setInteractions((prev) => ({ ...prev, [id]: data }));
    } catch {
      /* ignore */
    }
  }

  async function addInteraction(id: number) {
    if (!contact.content.trim()) return;
    await api(`/api/opportunities/${id}/interactions`, {
      method: 'POST',
      body: JSON.stringify(contact),
    });
    setContact({ channel: 'whatsapp', content: '' });
    const data = await api<Interaction[]>(`/api/opportunities/${id}/interactions`);
    setInteractions((prev) => ({ ...prev, [id]: data }));
  }

  return (
    <div>
      <PageTitle
        title="Oportunidades"
        subtitle="Cada negócio prospectado é uma venda em andamento. Avance no pipeline até fechar."
        actions={
          <button className={btnClass} onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} />
            Nova oportunidade
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>
      )}

      {showForm && (
        <Card className="mb-6 p-5">
          <h3 className="mb-4 text-base font-bold text-[#f0efe9]">Nova oportunidade</h3>
          <form onSubmit={createOpportunity} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select className={inputClass} required value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })}>
              <option value="">Negócio…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select className={inputClass} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <input className={inputClass} type="number" min="0" step="10" placeholder="Valor estimado (R$)" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
            <input className={inputClass} placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className={btnClass}>Criar</button>
          </form>
        </Card>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {OPPORTUNITY_STATUSES.map((status) => {
          const items = opportunities.filter((o) => o.status === status);
          const total = items.reduce((acc, o) => acc + o.estimatedValue, 0);
          return (
            <div key={status} className="w-72 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#f0efe9]">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                  {STATUS_LABELS[status]}
                </h3>
                <span className="rounded-full bg-[#262625] px-2 py-0.5 text-xs font-medium text-[#9c9b94]">
                  {items.length} · {formatBRL(total)}
                </span>
              </div>
              <div
                className="flex max-h-[560px] flex-col gap-3 overflow-y-auto rounded-xl border border-t-2 border-[#262624] bg-[#191918] p-3"
                style={{ borderTopColor: STATUS_HEX[status] }}
              >
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[#333330] px-2 py-6 text-center text-xs text-[#6f6f68]">
                    nada por aqui
                  </p>
                )}
                {items.map((o) => (
                  <Card key={o.id} className="cursor-pointer !p-4">
                    <div className="flex items-start justify-between gap-2" onClick={() => openDetail(o.id)}>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#eceae4]">{o.businessName}</p>
                        <p className="mt-0.5 text-xs text-[#8a8a83]">{SERVICES.find((s) => s.id === o.service)?.label ?? o.service}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-2 font-semibold text-[#c9a882]" onClick={() => openDetail(o.id)}>
                      {formatBRL(o.estimatedValue)}
                    </p>
                    {o.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#6f6f68]" onClick={() => openDetail(o.id)}>
                        {o.notes}
                      </p>
                    )}

                    <select
                      className="mt-3 w-full rounded-lg border border-[#333330] bg-[#232322] px-2 py-1.5 text-xs text-[#cfcdc6] outline-none focus:border-[#c9a882]"
                      value={o.status}
                      onChange={(e) => changeStatus(o.id, e.target.value as OpportunityStatus)}
                    >
                      {OPPORTUNITY_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>

                    {expanded === o.id && (
                      <div className="mt-3 border-t border-[#2a2a28] pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a8a83]">Contatos</p>
                        <div className="mb-2 flex flex-col gap-1.5">
                          {(interactions[o.id] ?? []).length === 0 && (
                            <p className="text-xs text-[#6f6f68]">Nenhum contato registrado.</p>
                          )}
                          {(interactions[o.id] ?? []).map((i) => (
                            <div key={i.id} className="rounded-lg bg-[#242423] p-2 text-xs">
                              <span className="font-medium text-sky-300">{CHANNEL_LABELS[i.channel]}</span>
                              <span className="text-[#6f6f68]"> · {i.direction === 'in' ? 'recebido' : 'enviado'} · {i.createdAt}</span>
                              <p className="mt-1 whitespace-pre-wrap text-[#cfcdc6]">{i.content}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <select
                            className="w-28 rounded-lg border border-[#333330] bg-[#232322] px-2 py-1 text-xs text-[#cfcdc6]"
                            value={contact.channel}
                            onChange={(e) => setContact({ ...contact, channel: e.target.value as InteractionChannel })}
                          >
                            {(Object.keys(CHANNEL_LABELS) as InteractionChannel[]).map((c) => (
                              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
                            ))}
                          </select>
                          <input
                            className="w-full rounded-lg border border-[#333330] bg-[#232322] px-2 py-1 text-xs text-[#eceae4] placeholder:text-[#6b6b64]"
                            placeholder="Resumo do contato…"
                            value={contact.content}
                            onChange={(e) => setContact({ ...contact, content: e.target.value })}
                          />
                          <button
                            className="shrink-0 rounded-lg bg-[#c9a882] px-2.5 py-1 text-xs font-semibold text-[#171512] transition hover:bg-[#d8bc99]"
                            onClick={() => addInteraction(o.id)}
                            title="Registrar contato"
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
