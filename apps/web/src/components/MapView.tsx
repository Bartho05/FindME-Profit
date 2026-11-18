import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Business } from '@findme/shared';

export interface MapViewProps {
  center: [number, number] | null;
  radiusKm: number;
  /** Ponto do usuário (marcador azul pulsante). */
  userPos: [number, number] | null;
  businesses: Business[];
  selectedId: number | null;
  fitKey: number;
  /** Token público do Mapbox (quando configurado no servidor). */
  mapboxToken: string | null;
  /** Modo "corrigir posição": clique no mapa define onde você está. */
  picking: boolean;
  onPickLocation: (lat: number, lng: number) => void;
  onSelect: (id: number) => void;
  onToggleFavorite: (b: Business) => void;
}

// Trava territorial: mapa abre em Minas Gerais (BH), não no Brasil inteiro —
// junto com MG_LOCK no servidor, evita busca/pin fora do estado.
const MG_HOME: [number, number] = [-19.2, -44.4];

/** Ícone de loja (lucide "store") em SVG inline para os pins do mapa. */
const STORE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>';

/** Estrela (lucide "star") para o botão de favorito no popup. */
const STAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

function leadIcon(favorite: boolean) {
  return L.divIcon({
    className: 'fp-pin' + (favorite ? ' fp-pin-fav' : ''),
    html: STORE_SVG,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

const USER_ICON = L.divIcon({
  className: 'fp-user',
  html: '<span class="fp-user-dot"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function BizMarker({
  b,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  b: Business;
  selected: boolean;
  onSelect: (id: number) => void;
  onToggleFavorite: (b: Business) => void;
}) {
  const ref = useRef<L.Marker>(null);
  const icon = useMemo(() => leadIcon(b.favorite), [b.favorite]);

  useEffect(() => {
    if (selected) ref.current?.openPopup();
  }, [selected]);

  return (
    <Marker
      position={[b.lat!, b.lng!]}
      icon={icon}
      ref={ref}
      eventHandlers={{ click: () => onSelect(b.id) }}
    >
      <Popup>
        <div className="fp-popup">
          <strong>{b.name}</strong>
          {b.category && <span className="fp-cat">{b.category}</span>}
          <p>{b.address ?? 'Sem endereço registrado'}</p>
          <p>{b.phone ? `Tel. ${b.phone}` : b.instagram ? `@${b.instagram.replace('@', '')}` : 'Sem contato'}</p>
          <button className="fp-fav-btn" onClick={() => onToggleFavorite(b)}>
            {b.favorite ? (
              <>Remover dos favoritos</>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: `${STAR_SVG}Favoritar — mantém entre buscas` }} />
            )}
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

/** Captura cliques no mapa (modo "corrigir minha posição"). */
function ClickPicker({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Controller({
  center,
  radiusKm,
  selectedId,
  fitKey,
  businesses,
}: {
  center: [number, number] | null;
  radiusKm: number;
  selectedId: number | null;
  fitKey: number;
  businesses: Business[];
}) {
  const map = useMap();

  // Ajusta o enquadramento para a área buscada (ponto + raio)
  useEffect(() => {
    if (!center || !fitKey) return;
    const d = radiusKm / 111;
    const bounds = L.latLngBounds(
      [center[0] - d, center[1] - d],
      [center[0] + d, center[1] + d]
    );
    map.fitBounds(bounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Sem área salva? Enquadra os pins existentes na abertura da página
  useEffect(() => {
    if (center || businesses.length === 0) return;
    const bounds = L.latLngBounds(businesses.map((b) => [b.lat!, b.lng!] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses.length > 0]);

  // Voa até o negócio selecionado (clique na lista)
  useEffect(() => {
    if (selectedId == null) return;
    const b = businesses.find((x) => x.id === selectedId);
    if (b?.lat != null && b?.lng != null) {
      map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return null;
}

export default function MapView({
  center,
  radiusKm,
  userPos,
  businesses,
  selectedId,
  fitKey,
  mapboxToken,
  picking,
  onPickLocation,
  onSelect,
  onToggleFavorite,
}: MapViewProps) {
  const pins = businesses.filter((b) => b.lat != null && b.lng != null);
  const c = center ?? MG_HOME;

  return (
    <MapContainer
      center={c}
      zoom={center ? 13 : 6}
      className={picking ? 'h-full w-full fp-picking' : 'h-full w-full'}
      scrollWheelZoom
      worldCopyJump
    >
      <ClickPicker enabled={picking} onPick={onPickLocation} />
      {/* Tiles escuras: Mapbox dark-v11 (com token) ou Esri Dark Gray (sem chave) */}
      {mapboxToken ? (
        <TileLayer
          attribution='&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}`}
          maxNativeZoom={19}
        />
      ) : (
        <>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />
        </>
      )}

      {userPos && <Marker position={userPos} icon={USER_ICON} />}

      {center && (
        <Circle
          center={center}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#c9a882', fillColor: '#c9a882', fillOpacity: 0.07, weight: 1.5, dashArray: '6 6' }}
        />
      )}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={45}
        showCoverageOnHover={false}
        iconCreateFunction={(cluster: { getChildCount(): number }) =>
          L.divIcon({
            html: `<span class="fp-cluster">${cluster.getChildCount()}</span>`,
            className: 'fp-cluster-wrap',
            iconSize: L.point(38, 38),
          })
        }
      >
        {pins.map((b) => (
          <BizMarker
            key={b.id}
            b={b}
            selected={selectedId === b.id}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </MarkerClusterGroup>

      <Controller center={center} radiusKm={radiusKm} selectedId={selectedId} fitKey={fitKey} businesses={pins} />
    </MapContainer>
  );
}
