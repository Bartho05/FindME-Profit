// Tipos e constantes compartilhados entre servidor e cliente.

export type BusinessStatus = 'sem_site' | 'com_site';

export interface Business {
  id: number;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  hasWebsite: boolean;
  websiteUrl: string | null;
  source: string | null;
  favorite: boolean;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export type OpportunityStatus =
  | 'prospect'
  | 'contacted'
  | 'negotiating'
  | 'won'
  | 'lost';

export const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'prospect',
  'contacted',
  'negotiating',
  'won',
  'lost',
];

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  prospect: 'Prospecção',
  contacted: 'Contatado',
  negotiating: 'Negociando',
  won: 'Ganho',
  lost: 'Perdido',
};

export interface Opportunity {
  id: number;
  businessId: number;
  businessName?: string;
  service: string;
  status: OpportunityStatus;
  estimatedValue: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InteractionChannel = 'whatsapp' | 'email' | 'call' | 'meeting';

export const CHANNEL_LABELS: Record<InteractionChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  call: 'Ligação',
  meeting: 'Reunião',
};

export interface Interaction {
  id: number;
  opportunityId: number;
  channel: InteractionChannel;
  direction: 'out' | 'in';
  content: string;
  createdAt: string;
}

export interface Template {
  id: number;
  name: string;
  channel: 'whatsapp' | 'email';
  content: string;
  createdAt: string;
}

export interface Stats {
  businessesTotal: number;
  businessesWithoutSite: number;
  opportunitiesOpen: number;
  pipelineValue: number;
  wonValue: number;
  byStatus: { status: OpportunityStatus; count: number; value: number }[];
}

// ---------- Catálogo de serviços e precificação ----------

export interface ServiceDef {
  id: string;
  label: string;
  min: number;
  max: number;
  description: string;
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'landing_page',
    label: 'Landing Page',
    min: 800,
    max: 1800,
    description: 'Página única focada em captação (anúncios, WhatsApp).',
  },
  {
    id: 'site_institucional',
    label: 'Site Institucional',
    min: 1500,
    max: 4000,
    description: 'Site com 3-8 páginas: quem somos, serviços, contato.',
  },
  {
    id: 'ecommerce',
    label: 'Loja Virtual (E-commerce)',
    min: 3000,
    max: 12000,
    description: 'Loja com catálogo, carrinho e pagamentos.',
  },
  {
    id: 'site_profissional',
    label: 'Site + Portfólio/Agendamento',
    min: 2000,
    max: 6000,
    description: 'Site com portfólio ou agendamento online integrado.',
  },
];

export interface PricingFactors {
  serviceId: string;
  pages: number;
  extras: string[];
  urgent: boolean;
}

export interface PricingBreakdownItem {
  label: string;
  delta: number;
}

export interface PricingEstimate {
  min: number;
  max: number;
  suggested: number;
  monthlyMaintenance: number;
  breakdown: PricingBreakdownItem[];
}

// Extra: id -> { label, multiplicador sobre a faixa base }
export const PRICING_EXTRAS: { id: string; label: string; factor: number }[] = [
  { id: 'copywriting', label: 'Textos/copywriting profissional', factor: 0.1 },
  { id: 'logo', label: 'Identidade visual / logo', factor: 0.1 },
  { id: 'photos', label: 'Fotografia profissional', factor: 0.08 },
  { id: 'seo', label: 'Otimização básica de SEO', factor: 0.12 },
  { id: 'integrations', label: 'Integrações (WhatsApp, redes, agendamento)', factor: 0.1 },
];

export const AVAILABLE_VARIABLES = [
  '{{negocio}}',
  '{{categoria}}',
  '{{cidade}}',
  '{{telefone}}',
  '{{servico}}',
  '{{valor}}',
] as const;

// ---------- Busca automática de negócios (sem site) ----------

export type SearchProvider = 'osm' | 'mapbox';

export interface SearchCategory {
  id: string;
  label: string;
  /** Filtros Overpass (OpenStreetMap) — provider legado, fora do fluxo. */
  osmFilters: string[];
  /** IDs canônicos de categoria da Search Box da Mapbox (máx. 4). */
  mapboxCategories: string[];
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'alimentacao',
    label: 'Alimentação',
    osmFilters: ['["shop"="bakery"]', '["shop"="confectionery"]', '["amenity"="cafe"]', '["amenity"="restaurant"]', '["amenity"="fast_food"]'],
    mapboxCategories: ['bakery', 'cafe', 'restaurant', 'fast_food'],
  },
  {
    id: 'beleza',
    label: 'Beleza e estética',
    osmFilters: ['["shop"="hairdresser"]', '["shop"="beauty"]', '["shop"="cosmetics"]', '["shop"="massage"]'],
    mapboxCategories: ['hairdresser', 'salon', 'nail_salon', 'spa'],
  },
  {
    id: 'automotivo',
    label: 'Automotivo',
    osmFilters: ['["shop"="car_repair"]', '["shop"="car_parts"]', '["shop"="tyres"]', '["shop"="motorcycle_repair"]'],
    mapboxCategories: ['auto_repair', 'auto_parts_wholesaler', 'car_wash', 'repair_shop'],
  },
  {
    id: 'saude',
    label: 'Saúde',
    osmFilters: ['["amenity"="pharmacy"]', '["healthcare"="dentist"]', '["healthcare"="doctor"]', '["healthcare"="physiotherapist"]'],
    mapboxCategories: ['pharmacy', 'dentist', 'doctors_office', 'physiotherapist'],
  },
  {
    id: 'pets',
    label: 'Pets',
    osmFilters: ['["shop"="pet"]', '["shop"="pet_grooming"]', '["amenity"="veterinary"]', '["healthcare"="veterinary"]'],
    mapboxCategories: ['pet_store', 'veterinarian'],
  },
  {
    id: 'moda',
    label: 'Moda',
    osmFilters: ['["shop"="clothes"]', '["shop"="shoes"]', '["shop"="jewelry"]', '["shop"="tailor"]'],
    mapboxCategories: ['clothing_store', 'shoe_store', 'jewelry_store', 'tailor'],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    osmFilters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]', '["leisure"="dance"]'],
    mapboxCategories: ['fitness_center', 'sports_club', 'yoga_studio', 'dance_studio'],
  },
  {
    id: 'servicos',
    label: 'Serviços gerais',
    osmFilters: ['["shop"="laundry"]', '["shop"="locksmith"]', '["shop"="mobile_phone_repair"]', '["shop"="electronics_repair"]', '["shop"="optician"]'],
    mapboxCategories: ['laundry', 'locksmith', 'optician', 'copyshop'],
  },
];

/** Negócio encontrado por busca automática (antes de importar). */
export interface FoundBusiness {
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SearchResult {
  provider: SearchProvider;
  city: string | null;
  /** Bairro identificado pela localização (quando busca por GPS). */
  neighborhood: string | null;
  /** Ponto central da busca (para centralizar o mapa). */
  lat: number;
  lng: number;
  radiusKm: number;
  categories: string[];
  found: number;
  withSite: number;
  alreadyImported: number;
  imported: Business[];
  notes: string[];
}

export interface SearchMeta {
  /** Fonte dos dados de negócios (Search Box da Mapbox). */
  provider: SearchProvider;
  /** Mapbox ativo (token válido no .env) — tiles + geocoding. */
  mapboxEnabled: boolean;
  /** Token público do Mapbox (pk.*) para o mapa no navegador, ou null. */
  mapboxToken: string | null;
  categories: SearchCategory[];
}
