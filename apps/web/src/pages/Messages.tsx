import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { AVAILABLE_VARIABLES, SERVICES, type Template, type Business, type Opportunity } from '@findme/shared';
import { api, formatBRL } from '../api';
import { PageTitle, Card, ConfirmDialog, inputClass, btnClass, btnGhostClass } from '../components/ui';

const EMPTY = { name: '', channel: 'whatsapp' as 'whatsapp' | 'email', content: '' };

export default function Messages() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const [templateId, setTemplateId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [rendered, setRendered] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Modal de confirmação de remoção de template
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await api<Template[]>('/api/templates'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    api<Business[]>('/api/businesses').then(setBusinesses).catch(() => {});
    api<Opportunity[]>('/api/opportunities').then(setOpportunities).catch(() => {});
  }, [load]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/templates', { method: 'POST', body: JSON.stringify(form) });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    setDeleting(true);
    try {
      await api(`/api/templates/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      if (String(id) === templateId) {
        setTemplateId('');
        setRendered(null);
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function render() {
    setCopied(false);
    if (!templateId || !businessId) {
      setError('Escolha um template e um negócio.');
      return;
    }
    setError(null);
    try {
      const result = await api<{ message: string }>('/api/templates/render', {
        method: 'POST',
        body: JSON.stringify({
          templateId: Number(templateId),
          businessId: Number(businessId),
          opportunityId: opportunityId ? Number(opportunityId) : undefined,
        }),
      });
      setRendered(result.message);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copy() {
    if (!rendered) return;
    await navigator.clipboard.writeText(rendered);
    setCopied(true);
  }

  return (
    <div>
      <PageTitle
        title="Mensagens"
        subtitle="Templates com variáveis — o app preenche os dados do negócio automaticamente."
        actions={
          <button className={btnClass} onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} />
            Novo template
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>
      )}

      {showForm && (
        <Card className="mb-6 p-5">
          <h3 className="mb-4 text-base font-bold text-[#f0efe9]">Novo template</h3>
          <form onSubmit={createTemplate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input className={inputClass} placeholder="Nome *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className={`${inputClass} sm:max-w-48`} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as 'whatsapp' | 'email' })}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="rounded-full border border-[#c9a882]/40 bg-[#c9a882]/10 px-2.5 py-1 font-medium text-[#e6cfae] hover:bg-[#c9a882]/20"
                  onClick={() => setForm((f) => ({ ...f, content: `${f.content}${v}` }))}
                >
                  {v}
                </button>
              ))}
            </div>
            <textarea className={`${inputClass} h-40`} placeholder="Escreva a mensagem usando as variáveis…" required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <button className={btnClass}>Salvar template</button>
          </form>
        </Card>
      )}

      <div className="grid items-start grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-base font-bold text-[#f0efe9]">Templates</h3>
          <div className="flex flex-col gap-3">
            {templates.map((t) => (
              <div key={t.id} className="group rounded-xl border border-[#2a2a28] p-3.5 transition-colors hover:border-[#4a4a46]">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-[#eceae4]">
                    {t.channel === 'whatsapp' ? (
                      <MessageSquare size={14} className="shrink-0 text-[#c9a882]" />
                    ) : (
                      <Mail size={14} className="shrink-0 text-[#c9a882]" />
                    )}
                    {t.name}
                  </p>
                  <button
                    className="shrink-0 rounded-lg px-1.5 py-1 text-[#6f6f68] opacity-0 transition-opacity hover:bg-[#2a2a28] hover:text-rose-300 group-hover:opacity-100"
                    title="Remover template"
                    onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-[#8a8a83]">{t.content}</p>
              </div>
            ))}
            {templates.length === 0 && <p className="text-sm text-[#6f6f68]">Nenhum template ainda.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-base font-bold text-[#f0efe9]">Enviar para um negócio</h3>
          <div className="flex flex-col gap-3">
            <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select className={inputClass} value={businessId} onChange={(e) => { setBusinessId(e.target.value); setOpportunityId(''); }}>
              <option value="">Negócio…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select
              className={inputClass}
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              disabled={!businessId}
            >
              <option value="">Sem valores de oportunidade (opcional)</option>
              {opportunities
                .filter((o) => String(o.businessId) === String(businessId))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.businessName} — {SERVICES.find((s) => s.id === o.service)?.label ?? o.service} · {formatBRL(o.estimatedValue)}
                  </option>
                ))}
            </select>
            <button className={btnGhostClass} onClick={render}>
              <Send size={15} />
              Gerar mensagem
            </button>
            {rendered && (
              <div className="rounded-xl border border-[#2a2a28] bg-[#191918] p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm text-[#cfcdc6]">{rendered}</pre>
                <button className={`${btnGhostClass} mt-3`} onClick={copy}>
                  {copied ? <Copy size={15} className="text-emerald-300" /> : <Copy size={15} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ---------- Modal de confirmação de remoção ---------- */}
      <ConfirmDialog
        open={confirmDelete != null}
        title={`Remover o template "${confirmDelete?.name ?? ''}"?`}
        description="Mensagens já geradas não são afetadas. Não dá para desfazer."
        busy={deleting}
        onConfirm={() => confirmDelete && remove(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
