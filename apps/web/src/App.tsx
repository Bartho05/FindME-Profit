import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Bell,
  Calculator as CalculatorIcon,
  CircleDollarSign,
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Search,
  Target,
  User,
  type LucideIcon,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Businesses from './pages/Businesses';
import Opportunities from './pages/Opportunities';
import Calculator from './pages/Calculator';
import Messages from './pages/Messages';

const NAV_ITEMS: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/negocios', label: 'Negócios', Icon: MapIcon },
  { to: '/oportunidades', label: 'Oportunidades', Icon: Target },
  { to: '/calculadora', label: 'Calculadora', Icon: CalculatorIcon },
  { to: '/mensagens', label: 'Mensagens', Icon: MessageSquare },
];

export default function App() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');
  const [area, setArea] = useState<{ label?: string; radiusKm?: number } | null>(null);

  // Última área localizada (a página Negócios dispara o evento 'fp:area' ao salvar)
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem('fp:lastArea');
        setArea(saved ? (JSON.parse(saved) as { label?: string; radiusKm?: number }) : null);
      } catch {
        setArea(null);
      }
    };
    read();
    window.addEventListener('fp:area', read);
    return () => window.removeEventListener('fp:area', read);
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQ.trim();
    navigate(q ? `/negocios?q=${encodeURIComponent(q)}` : '/negocios');
    setSearchQ('');
  }

  const dateStr = (() => {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#141413]">
      <div className="flex flex-1">
          {/* ---------- Sidebar circular (desktop) ---------- */}
          <aside className="hidden w-24 shrink-0 flex-col items-center border-r border-[#242423] py-7 sm:flex">
            <div
              className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#d8bc99] to-[#a98862] text-[#171512] shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
              title="FindMe Profit"
            >
              <CircleDollarSign size={22} strokeWidth={2.2} />
            </div>

            <nav className="mt-9 flex flex-col items-center gap-3">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  aria-label={label}
                  className={({ isActive }) =>
                    `grid h-12 w-12 place-items-center rounded-full border transition-all ${
                      isActive
                        ? 'border-transparent bg-[#c9a882] text-[#171512] shadow-[0_4px_14px_rgba(201,168,130,0.25)]'
                        : 'border-[#2e2e2c] text-[#8f8f87] hover:border-[#4a4a46] hover:text-[#f0efe9]'
                    }`
                  }
                  end={to === '/'}
                >
                  <Icon size={19} strokeWidth={2} />
                </NavLink>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* ---------- Topbar ---------- */}
            <header className="flex flex-wrap items-center gap-4 px-5 pt-6 lg:px-9">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#f0efe9]">{dateStr}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[#8a8a83]">
                  <MapPin size={13} className="shrink-0 text-[#c9a882]" />
                  {area?.label ?? 'Localização não definida'}
                </p>
              </div>

              <form onSubmit={submitSearch} className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md sm:mx-auto">
                <label className="flex items-center gap-2.5 rounded-full border border-[#2c2c2a] bg-[#1e1e1d] px-4 py-2.5 transition focus-within:border-[#c9a882]/60">
                  <Search size={15} className="shrink-0 text-[#6f6f68]" />
                  <input
                    className="w-full bg-transparent text-sm text-[#eceae4] outline-none placeholder:text-[#6b6b64]"
                    placeholder="Buscar negócios…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                  />
                </label>
              </form>

              <div className="ml-auto flex items-center gap-3">
                <button
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#2e2e2c] text-[#8f8f87] transition hover:border-[#4a4a46] hover:text-[#f0efe9]"
                  title="Sem notificações"
                  type="button"
                >
                  <Bell size={17} />
                </button>
                <div className="flex items-center gap-2.5">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#d8bc99] to-[#a98862] text-[#171512]">
                    <User size={18} strokeWidth={2.2} />
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm font-semibold leading-tight text-[#f0efe9]">Você</p>
                    <p className="text-xs leading-tight text-[#8a8a83]">Prospecção local</p>
                  </div>
                </div>
              </div>
            </header>

            {/* ---------- Nav horizontal (mobile) ---------- */}
            <nav className="mt-4 flex gap-2 overflow-x-auto px-5 sm:hidden">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  aria-label={label}
                  className={({ isActive }) =>
                    `flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-medium transition ${
                      isActive
                        ? 'border-transparent bg-[#c9a882] text-[#171512]'
                        : 'border-[#2e2e2c] text-[#8f8f87]'
                    }`
                  }
                >
                  <Icon size={14} />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* ---------- Conteúdo ---------- */}
            <main className="flex-1 px-5 pb-10 pt-6 lg:px-9">
              <div className="mx-auto w-full max-w-[1400px]">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/negocios" element={<Businesses />} />
                  <Route path="/oportunidades" element={<Opportunities />} />
                  <Route path="/calculadora" element={<Calculator />} />
                  <Route path="/mensagens" element={<Messages />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </main>
          </div>
      </div>
    </div>
  );
}
