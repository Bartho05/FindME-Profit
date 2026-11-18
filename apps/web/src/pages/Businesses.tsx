import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AtSign,
  CheckCircle2,
  Crosshair,
  Globe,
  Info,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Radar,
  Star,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { SEARCH_CATEGORIES, type Business, type SearchMeta, type SearchResult } from '@findme/shared';
import { api } from '../api';
import MapView from '../components/MapView';
import { ConfirmDialog, Modal, PageTitle, Card, inputClass, btnClass, btnGhostClass } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  category: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  instagram: '',
  websiteUrl: '',
};

/** Rótulo amigável para a origem do cadastro (mostrada no modal de detalhes). */
const SOURCE_LABELS: Record<string, string> = {
  osm: 'OpenStreetMap',
  mapbox: 'Mapbox',
  google: 'Google',
  manual: 'cadastro manual',
  csv: 'importado (CSV)',
  seed: 'exemplo',
};

/** Fone → link do WhatsApp (com DDI 55 quando falta). */
function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

/** Máscara de telefone BR conforme digita: (11) 98765-4321. */
function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Máscara de CEP conforme digita: enquanto o texto for só dígitos (até 8),
 * formata "00000-000" sozinho — a partir da 6ª cifra entra o traço. Texto
 * com letras (rua, bairro, cidade) não é mexido; apagar funciona normal.
 */
function maskCepLike(raw: string): string {
  if (/[a-zA-ZÀ-ÿ]/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 8) return raw;
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

/** Garante o protocolo em site digitado sem http(s). */
function siteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Linha de informação do modal de detalhes (ícone bege + conteúdo). */
function DetailRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon size={15} className="mt-0.5 shrink-0 text-[#c9a882]" />
      <span className="min-w-0 break-words text-[#eceae4]">{children}</span>
    </div>
  );
}

function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'Acesso à localização negado. Clique no cadeado (ou ícone de local) na barra de endereço, permita a localização para este site e recarregue a página.';
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'Não foi possível obter sua posição. Verifique se o GPS/Wi-Fi do aparelho está ativado — ou marque o ponto manualmente com "Corrigir no mapa".';
  }
  return 'Tempo esgotado aguardando o GPS. Tente de novo — em celulares, fique perto de uma janela ou céu aberto.';
}

export default function Businesses() {
  // ---------- dados ----------
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);

  // ---------- filtros da lista ----------
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [semSite, setSemSite] = useState(false);
  const [cidadeFiltro, setCidadeFiltro] = useState('');

  // Sincroniza quando a busca do topo navega para /negocios?q=...
  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
  }, [searchParams]);

  // ---------- formulários ----------
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [csv, setCsv] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- mapa / busca automática ----------
  const [mode, setMode] = useState<'city' | 'geo'>('geo');
  const [cityInput, setCityInput] = useState('');
  const [radius, setRadius] = useState(2);
  const [cats, setCats] = useState<string[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [geocoding, setGeocoding] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // Modal de confirmação de remoção
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Modal de detalhes (id em vez do objeto: após favoritar, a lista recarrega e o modal mostra o estado novo)
  const [detailId, setDetailId] = useState<number | null>(null);
  const detailBiz = detailId == null ? null : (businesses.find((x) => x.id === detailId) ?? null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (semSite) params.set('semSite', '1');
    if (cidadeFiltro) params.set('cidade', cidadeFiltro);
    setError(null);
    try {
      const data = await api<Business[]>(`/api/businesses?${params}`);
      setBusinesses(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q, semSite, cidadeFiltro]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<string[]>('/api/businesses/cities').then(setCities).catch(() => {});
    api<SearchMeta>('/api/search/meta').then(setMeta).catch(() => {});
  }, []);

  // ---------- inicialização (roda uma vez) ----------
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      // Estado da permissão de localização no navegador
      let perm = 'prompt';
      try {
        perm = (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
      } catch {
        // Navegador sem Permissions API — assume 'prompt'
      }

      // Permissão negada ou sem GPS: restaura a última área vista (e explica o bloqueio)
      if (perm === 'denied' || !('geolocation' in navigator)) {
        try {
          const saved = localStorage.getItem('fp:lastArea');
          if (saved) {
            const a = JSON.parse(saved) as { lat: number; lng: number; radiusKm: number; label?: string };
            setCenter([a.lat, a.lng]);
            setRadius(a.radiusKm);
            if (a.label) setAreaLabel(a.label);
            setFitKey((k) => k + 1);
          }
        } catch {
          // localStorage indisponível — segue sem restaurar
        }
        if (perm === 'denied') {
          setGeoNotice(
            'Localização bloqueada neste navegador. Para aparecer no mapa: clique no cadeado da barra de endereço → Permissões → Localização → Permitir, e recarregue a página.'
          );
        }
      } else {
        // Você aparece no mapa assim que a página abre (o navegador pede permissão na 1ª vez)
        locate().catch((e: Error) => setGeoNotice(e.message));
      }

      // Negócios antigos sem coordenadas? Posiciona no mapa (uma vez por sessão)
      try {
        const list = await api<Business[]>('/api/businesses?semSite=1');
        if (list.some((b) => b.lat == null && b.address)) {
          setGeocoding(true);
          try {
            await api('/api/businesses/geocode-missing', { method: 'POST' });
            await load();
          } finally {
            setGeocoding(false);
          }
        }
      } catch {
        // segue sem os pins antigos — a próxima busca já cria os novos com coordenadas
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- localização exata ----------
  /** Uma leitura do GPS (alta precisão, sem cache). */
  function readPosition(timeoutMs = 12_000): Promise<GeolocationPosition> {
    if (!('geolocation' in navigator)) {
      return Promise.reject(new Error('Este navegador não tem suporte a localização. Use Chrome ou Edge atualizado.'));
    }
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, // GPS real do aparelho, não a localização "aproximada"
        timeout: timeoutMs,
        maximumAge: 0,
      })
    );
  }

  /**
   * Localiza com precisão: faz até 3 leituras do GPS e fica com a melhor
   * (menor "accuracy"). Para na primeira leitura que já vier boa (<= 40 m).
   */
  async function locate(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
    setLocating(true);
    try {
      let best: GeolocationPosition | null = null;
      let lastError: unknown = null;

      for (let i = 0; i < 3; i++) {
        try {
          const p = await readPosition();
          if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
          if (best.coords.accuracy <= 40) break; // já está preciso o suficiente
        } catch (err) {
          lastError = err;
        }
      }

      if (!best) {
        if (lastError instanceof GeolocationPositionError || (lastError as GeolocationPositionError)?.code != null) {
          throw new Error(geoErrorMessage(lastError as GeolocationPositionError));
        }
        throw new Error('Não foi possível obter sua posição pelo GPS. Use "Corrigir no mapa" para marcar manualmente.');
      }

      const lat = best.coords.latitude;
      const lng = best.coords.longitude;
      const acc = best.coords.accuracy ?? null;

      setUserPos([lat, lng]);
      setCenter([lat, lng]);
      setAccuracy(acc);
      setMode('geo');
      setFitKey((k) => k + 1);

      let label = 'Sua localização';
      try {
        const rev = await api<{ city: string | null; neighborhood: string | null }>(
          `/api/search/reverse?lat=${lat}&lng=${lng}`
        );
        label = `${rev.neighborhood ? rev.neighborhood + ' · ' : ''}${rev.city ?? 'sua região'}`;
      } catch {
        // sem endereço — mantém o rótulo genérico
      }
      setAreaLabel(label);
      saveLastArea(lat, lng, radius, label);
      return { lat, lng, accuracy: acc };
    } finally {
      setLocating(false);
    }
  }

  function saveLastArea(lat: number, lng: number, radiusKm: number, label?: string) {
    try {
      localStorage.setItem('fp:lastArea', JSON.stringify({ lat, lng, radiusKm, label }));
      // A topbar (data + localização) lê o mesmo dado
      window.dispatchEvent(new Event('fp:area'));
    } catch {
      // segue sem persistir
    }
  }

  /** Define a posição manualmente: clique no mapa no ponto exato onde você está. */
  async function pickLocation(lat: number, lng: number) {
    setPicking(false);
    setUserPos([lat, lng]);
    setCenter([lat, lng]);
    setAccuracy(null);
    setMode('geo');
    setFitKey((k) => k + 1);
    let label = 'posição marcada no mapa';
    try {
      const rev = await api<{ city: string | null; neighborhood: string | null }>(
        `/api/search/reverse?lat=${lat}&lng=${lng}`
      );
      label =
        `${rev.neighborhood ? rev.neighborhood + ' · ' : ''}${rev.city ?? ''}`.trim() || label;
    } catch {
      // sem endereço — mantém o rótulo genérico
    }
    setAreaLabel(label);
    saveLastArea(lat, lng, radius, label);
  }

  /** Texto de status da posição, com aviso quando o GPS erra (comum no notebook). */
  function locationHint(): string {
    if (picking) return 'Clique no mapa no ponto exato onde você está — a busca vai usar esse ponto.';
    if (locating) return 'Lendo o GPS (até 3 tentativas, ficamos com a mais precisa)…';
    if (userPos) {
      const base = accuracy
        ? `Você está em: ${areaLabel ?? 'sua posição'} (precisão ±${Math.round(accuracy)} m)`
        : `Posição que você marcou: ${areaLabel ?? 'no mapa'}`;
      const warn =
        accuracy && accuracy > 120
          ? ' — precisão baixa: se o ponto não é exatamente onde você está, use "Corrigir no mapa".'
          : '';
      return `${base} — a área pontilhada é o que será buscado.${warn}`;
    }
    if (center) return `Área: ${areaLabel ?? 'última busca'} — a área pontilhada é o que será buscado.`;
    return 'Clique em "Localizar no mapa" para usar seu GPS com precisão (no celular é mais exato que no notebook).';
  }

  // ---------- busca automática ----------
  async function runSearchAction() {
    setSearchError(null);
    setSearchResult(null);
    setSearching(true);
    try {
      const body: Record<string, unknown> = { radiusKm: radius, categories: cats, limit: 40 };
      if (mode === 'geo') {
        if (userPos) {
          body.lat = userPos[0];
          body.lng = userPos[1];
        } else {
          const loc = await locate();
          body.lat = loc.lat;
          body.lng = loc.lng;
        }
      } else {
        if (!cityInput.trim()) throw new Error('Digite uma cidade, bairro, rua ou CEP para buscar (ou use "minha localização").');
        body.city = cityInput.trim();
      }
      const r = await api<SearchResult>('/api/search/businesses', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSearchResult(r);
      setCenter([r.lat, r.lng]);
      setFitKey((k) => k + 1);
      saveLastArea(r.lat, r.lng, r.radiusKm, r.neighborhood ? `${r.neighborhood} · ${r.city ?? ''}` : r.city ?? undefined);
      await load();
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function toggleCat(id: string) {
    setCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function addBusiness(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Trim em tudo: nome com espaço no fim não deve virar negócio duplicável
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      await api('/api/businesses', { method: 'POST', body: JSON.stringify(payload) });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage(`"${form.name}" adicionado!`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await api<{ imported: number; skipped: number }>('/api/businesses/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      });
      setCsv('');
      setShowImport(false);
      setMessage(`${result.imported} negócios importados (${result.skipped} ignorados).`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    setDeleting(true);
    try {
      await api(`/api/businesses/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleFavorite(b: Business) {
    await api(`/api/businesses/${b.id}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite: !b.favorite }),
    });
    await load();
  }

  /** Abre o modal de detalhes e leva o mapa até o pin (quando tem coordenada). */
  function openDetails(b: Business) {
    setDetailId(b.id);
    if (b.lat != null && b.lng != null) setSelectedId(b.id);
  }

  return (
    <div>
      <PageTitle
        title="Negócios"
        subtitle="Mapa da sua região — importe os negócios e verifique você mesmo quem ainda não tem site."
        actions={
          <>
            <button className={btnGhostClass} onClick={() => { setShowImport((v) => !v); setShowForm(false); }}>
              <Upload size={15} />
              Importar CSV
            </button>
            <button className={btnClass} onClick={() => { setShowForm((v) => !v); setShowImport(false); }}>
              <Plus size={16} />
              Novo negócio
            </button>
          </>
        }
      />

      {message && (
        <p className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          {message}
        </p>
      )}
      {geocoding && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-300">
          <Loader2 size={15} className="animate-spin" />
          Completando endereço e CEP dos negócios (e posicionando-os no mapa)…
        </p>
      )}
      {geoNotice && !userPos && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <Info size={15} className="mt-0.5 shrink-0" />
          {geoNotice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</p>
      )}

      {showForm && (
        <Card className="mb-5 p-5">
          <h3 className="mb-4 text-base font-bold text-[#f0efe9]">Novo negócio</h3>
          <form onSubmit={addBusiness} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={inputClass} placeholder="Nome *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputClass} placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <input className={inputClass} placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className={inputClass} placeholder="Endereço" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <input className={inputClass} placeholder="Telefone / WhatsApp" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
            <input className={inputClass} placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={inputClass} placeholder="@instagram" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            <input className={inputClass} placeholder="URL do site (se tiver)" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
            <button className={btnClass}>Salvar negócio</button>
          </form>
        </Card>
      )}

      {showImport && (
        <Card className="mb-5 p-5">
          <h3 className="mb-2 text-base font-bold text-[#f0efe9]">Importar negócios via CSV</h3>
          <p className="mb-2 text-xs text-[#8a8a83]">
            Colunas aceitas: <code className="font-semibold text-[#c9a882]">name, category, city, address, phone, email, instagram, website_url</code>.
          </p>
          <form onSubmit={importCsv}>
            <textarea
              className={`${inputClass} h-32 font-mono text-xs`}
              placeholder={'name,category,city,phone,address\n"Padaria do Zé",Alimentação,"São Paulo",11987650001,"Rua X, 100"'}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              required
            />
            <button className={`${btnClass} mt-3`}>Importar</button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ---------- Coluna esquerda: controles + mapa ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#eceae4]">
                <input type="radio" checked={mode === 'geo'} onChange={() => { setMode('geo'); setRadius(2); }} />
                Minha localização
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-[#eceae4]">
                <input type="radio" checked={mode === 'city'} onChange={() => { setMode('city'); setRadius(5); }} />
                Por endereço ou cidade
              </label>

              {mode === 'geo' ? (
                <button
                  className={btnGhostClass}
                  onClick={async () => {
                    setSearchError(null);
                    try {
                      await locate();
                    } catch (e) {
                      setSearchError((e as Error).message);
                    }
                  }}
                  disabled={locating}
                >
                  {locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
                  {locating ? 'Localizando…' : 'Localizar no mapa'}
                </button>
              ) : (
                <input
                  className={`${inputClass} max-w-64`}
                  placeholder="Cidade, bairro ou CEP de MG"
                  autoFocus
                  value={cityInput}
                  onChange={(e) => setCityInput(maskCepLike(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearchAction(); } }}
                />
              )}

              <button
                className={picking ? `${btnGhostClass} !border-amber-400/60 !bg-amber-400/10 !text-amber-300` : btnGhostClass}
                onClick={() => setPicking((v) => !v)}
                title="Clique no mapa no ponto exato onde você está"
              >
                <Crosshair size={15} />
                Corrigir no mapa
              </button>

              <label className="flex items-center gap-2 text-sm text-[#cfcdc6]">
                Raio:
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="w-16 rounded-lg border border-[#333330] bg-[#232322] px-2 py-1.5 text-sm text-[#eceae4]"
                  value={radius}
                  onChange={(e) => setRadius(Math.min(20, Math.max(1, Number(e.target.value) || 2)))}
                />
                km
              </label>

              <button className={btnClass} onClick={runSearchAction} disabled={searching || locating}>
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                {searching ? 'Buscando… (até ~1 min)' : 'Buscar negócios'}
              </button>
            </div>

            {mode === 'geo' && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[#8a8a83]">
                <MapPin size={13} className="mt-0.5 shrink-0 text-[#c9a882]" />
                {locationHint()}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {SEARCH_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    cats.includes(c.id)
                      ? 'border-[#c9a882]/60 bg-[#c9a882]/15 text-[#e6cfae]'
                      : 'border-[#333330] bg-[#242423] text-[#9c9b94] hover:border-[#c9a882]/50 hover:text-[#e6cfae]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {cats.length === 0 && (
                <span className="self-center text-xs text-[#6f6f68]">(nenhuma marcada = todas)</span>
              )}
            </div>

            {searchError && (
              <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">
                {searchError}
              </p>
            )}

            {searchResult && (
              <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-sm">
                <p className="flex items-start gap-2 font-medium text-emerald-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{searchResult.imported.length}</b> negócios importados · {searchResult.alreadyImported} já
                    conhecidos · {searchResult.withSite} vieram com site na ficha da Mapbox
                  </span>
                </p>
                <p className="mt-1 pl-[23px] text-xs text-[#8a8a83]">
                  {searchResult.neighborhood ? `${searchResult.neighborhood} · ` : ''}
                  {searchResult.city ?? 'área buscada'} · raio {searchResult.radiusKm} km · fonte: Mapbox · o
                  "sem site" vem da ficha do local e pode estar desatualizado — verifique os principais
                </p>
                {searchResult.notes.map((n, i) => (
                  <p key={i} className="mt-1 pl-[23px] text-xs text-amber-300">{n}</p>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden !p-0">
            <div className="relative">
              <div className="h-[320px] sm:h-[460px]">
                <MapView
                  center={center}
                  radiusKm={radius}
                  userPos={userPos}
                  businesses={businesses}
                  selectedId={selectedId}
                  fitKey={fitKey}
                  mapboxToken={meta?.mapboxToken ?? null}
                  picking={picking}
                  onPickLocation={pickLocation}
                  onSelect={setSelectedId}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl border border-[#2c2c2a] bg-[#141413]/90 px-3 py-2 text-[11px] leading-relaxed text-[#cfcdc6] shadow-sm">
                <p className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> você
                  <span className="ml-2 h-2 w-2 rounded-full border border-[#c9a882] bg-[#1c1c1b]" /> lead
                  <span className="ml-2 h-2 w-2 rounded-full bg-[#c9a882]" /> favorito
                </p>
                <p className="text-[#6f6f68]">área pontilhada = raio da busca</p>
              </div>
            </div>
          </Card>
        </div>

        {/* ---------- Coluna direita: lista ---------- */}
        <Card className="flex min-w-0 max-h-[760px] flex-col !p-0">
          <div className="border-b border-[#2a2a28] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#f0efe9]">
                Lista de negócios <span className="text-sm font-normal text-[#6f6f68]">({businesses.length})</span>
              </h3>
              <label className="flex items-center gap-2 text-xs text-[#8a8a83]">
                <input type="checkbox" checked={semSite} onChange={(e) => setSemSite(e.target.checked)} />
                só sem site
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                placeholder="Buscar…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select className={`${inputClass} max-w-44`} value={cidadeFiltro} onChange={(e) => setCidadeFiltro(e.target.value)}>
                <option value="">Todas as cidades</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 divide-y divide-[#262624] overflow-y-auto">
            {businesses.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#6f6f68]">
                Nenhum negócio aqui ainda.<br />
                Use o mapa para buscar na sua região — favoritos ficam de uma busca para outra.
              </p>
            ) : (
              businesses.map((b) => (
                <div
                  key={b.id}
                  className={`group flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                    selectedId === b.id ? 'bg-[#c9a882]/10' : b.favorite ? 'bg-[#c9a882]/5 hover:bg-[#c9a882]/10' : 'hover:bg-[#232322]'
                  }`}
                  onClick={() => openDetails(b)}
                >
                  <button
                    className="mt-0.5 shrink-0 transition-transform hover:scale-110"
                    title={b.favorite ? 'Remover dos favoritos' : 'Favoritar (mantém entre buscas)'}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(b); }}
                  >
                    <Star
                      size={18}
                      className={b.favorite ? 'fill-[#c9a882] text-[#c9a882]' : 'text-[#6f6f68] hover:text-[#c9a882]'}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[#eceae4]">
                      <span className="truncate">{b.name}</span>
                      {!b.hasWebsite && (
                        <span
                          className="shrink-0 rounded-full border border-[#c9a882]/30 bg-[#c9a882]/10 px-1.5 text-[10px] font-semibold text-[#e6cfae]"
                          title="Sem site na ficha da Mapbox — confirme você mesmo"
                        >
                          sem site
                        </span>
                      )}
                      {b.hasWebsite && b.websiteUrl && (
                        <span
                          className="shrink-0 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 text-[10px] font-semibold text-sky-300"
                          title={`Site na ficha da Mapbox: ${b.websiteUrl}`}
                        >
                          site registrado
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[#6f6f68]" title={b.address ?? undefined}>
                      {b.address ?? 'sem endereço'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-sky-300">
                      {b.phone ? <Phone size={11} className="shrink-0" /> : b.instagram ? <AtSign size={11} className="shrink-0" /> : b.email ? <Mail size={11} className="shrink-0" /> : null}
                      {b.phone ? b.phone : b.instagram ? b.instagram : b.email ?? ''}
                    </p>
                  </div>
                  <button
                    className="shrink-0 self-center rounded-lg p-1.5 text-[#6f6f68] opacity-0 transition-opacity hover:bg-[#2a2a28] hover:text-rose-300 group-hover:opacity-100"
                    title="Remover negócio"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: b.id, name: b.name }); }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ---------- Modal de detalhes do negócio ---------- */}
      <Modal
        open={detailBiz != null}
        onClose={() => setDetailId(null)}
        title={detailBiz?.name ?? ''}
      >
        {detailBiz && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {detailBiz.category && (
                <span className="rounded-full border border-[#c9a882]/30 bg-[#c9a882]/10 px-2.5 py-1 text-xs font-semibold text-[#e6cfae]">
                  {detailBiz.category}
                </span>
              )}
              {detailBiz.hasWebsite ? (
                <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-300">
                  site registrado
                </span>
              ) : (
                <span className="rounded-full border border-[#c9a882]/30 bg-[#c9a882]/10 px-2.5 py-1 text-xs font-semibold text-[#e6cfae]">
                  sem site
                </span>
              )}
              {detailBiz.favorite && (
                <span className="rounded-full border border-[#c9a882]/40 bg-[#c9a882]/15 px-2.5 py-1 text-xs font-semibold text-[#e6cfae]">
                  favorito
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <DetailRow icon={MapPin}>
                {detailBiz.address ?? 'sem endereço'}
                {detailBiz.city && !detailBiz.address?.includes(detailBiz.city) ? ` — ${detailBiz.city}` : ''}
              </DetailRow>
              {detailBiz.phone && (
                <DetailRow icon={Phone}>
                  {waLink(detailBiz.phone) ? (
                    <a className="text-sky-300 hover:underline" href={waLink(detailBiz.phone)!} target="_blank" rel="noreferrer">
                      {detailBiz.phone}
                    </a>
                  ) : (
                    detailBiz.phone
                  )}
                </DetailRow>
              )}
              {detailBiz.email && (
                <DetailRow icon={Mail}>
                  <a className="text-sky-300 hover:underline" href={`mailto:${detailBiz.email}`}>
                    {detailBiz.email}
                  </a>
                </DetailRow>
              )}
              {detailBiz.instagram && (
                <DetailRow icon={AtSign}>
                  <a
                    className="text-sky-300 hover:underline"
                    href={`https://instagram.com/${detailBiz.instagram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detailBiz.instagram}
                  </a>
                </DetailRow>
              )}
              {detailBiz.websiteUrl && (
                <DetailRow icon={Globe}>
                  <a className="text-sky-300 hover:underline" href={siteUrl(detailBiz.websiteUrl)} target="_blank" rel="noreferrer">
                    {detailBiz.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  </a>
                </DetailRow>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {waLink(detailBiz.phone) && (
                <a className={btnClass} href={waLink(detailBiz.phone)!} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} />
                  WhatsApp
                </a>
              )}
              {detailBiz.websiteUrl && (
                <a className={btnGhostClass} href={siteUrl(detailBiz.websiteUrl)} target="_blank" rel="noreferrer">
                  <Globe size={15} />
                  Abrir site
                </a>
              )}
              <button className={btnGhostClass} onClick={() => toggleFavorite(detailBiz)} type="button">
                <Star size={15} className={detailBiz.favorite ? 'fill-[#c9a882] text-[#c9a882]' : ''} />
                {detailBiz.favorite ? 'Remover dos favoritos' : 'Favoritar'}
              </button>
            </div>

            <p className="text-xs text-[#6f6f68]">
              fonte: {detailBiz.source ? (SOURCE_LABELS[detailBiz.source] ?? detailBiz.source) : '—'} · cadastrado em{' '}
              {new Date(detailBiz.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}
      </Modal>

      {/* ---------- Modal de confirmação de remoção ---------- */}
      <ConfirmDialog
        open={confirmDelete != null}
        title={`Remover "${confirmDelete?.name ?? ''}"?`}
        description="O negócio e as oportunidades dele saem da lista. Não dá para desfazer."
        busy={deleting}
        onConfirm={() => confirmDelete && remove(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
