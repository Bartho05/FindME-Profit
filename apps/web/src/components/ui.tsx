import { useEffect } from 'react';
import { STATUS_LABELS, type OpportunityStatus } from '@findme/shared';
import { Trash2, TriangleAlert, X } from 'lucide-react';

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[#f2f1eb]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#8a8a83]">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_COLORS: Record<OpportunityStatus, string> = {
  prospect: 'bg-white/5 text-[#9ca3af] border-white/10',
  contacted: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  negotiating: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  won: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  lost: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
};

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export const STATUS_DOT: Record<OpportunityStatus, string> = {
  prospect: 'bg-[#9ca3af]',
  contacted: 'bg-[#38bdf8]',
  negotiating: 'bg-[#fbbf24]',
  won: 'bg-[#4ade80]',
  lost: 'bg-[#fb7185]',
};

export const STATUS_HEX: Record<OpportunityStatus, string> = {
  prospect: '#9ca3af',
  contacted: '#38bdf8',
  negotiating: '#fbbf24',
  won: '#4ade80',
  lost: '#fb7185',
};

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[#262624] bg-[#1e1e1d] shadow-[0_2px_16px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-[#333330] bg-[#232322] px-3.5 py-2.5 text-sm text-[#eceae4] outline-none placeholder:text-[#6b6b64] transition focus:border-[#c9a882] focus:ring-2 focus:ring-[#c9a882]/20';

export const btnClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a882] px-5 py-2.5 text-sm font-semibold text-[#171512] shadow-sm transition hover:bg-[#d8bc99] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export const btnGhostClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[#383836] bg-[#242423] px-4 py-2.5 text-sm font-medium text-[#cfcdc6] transition hover:border-[#c9a882] hover:text-[#c9a882] disabled:opacity-50';

export const btnDangerClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Modal genérico de conteúdo (ex.: detalhes de um negócio). Fecha com
 * Esc, clique fora ou no botão X. Ícones SVG, nada de emoji.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#2e2e2c] bg-[#1e1e1d] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#2a2a28] p-5 pb-4">
          <h3 className="min-w-0 break-words text-lg font-bold text-[#f0efe9]">{title}</h3>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#333330] text-[#8f8f87] transition hover:border-[#c9a882] hover:text-[#c9a882]"
            onClick={onClose}
            title="Fechar"
            type="button"
          >
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Modal de confirmação para ações destrutivas (ex.: deletar). Fecha com
 * Esc ou clique fora; Enter confirma. Ícones SVG, nada de emoji.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-[#2e2e2c] bg-[#1e1e1d] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <TriangleAlert size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#f0efe9]">{title}</h3>
            {description && <p className="mt-1 text-sm text-[#8a8a83]">{description}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnGhostClass} onClick={onCancel} disabled={busy} type="button">
            {cancelLabel}
          </button>
          <button className={btnDangerClass} onClick={onConfirm} disabled={busy} type="button">
            <Trash2 size={15} />
            {busy ? 'Excluindo…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
