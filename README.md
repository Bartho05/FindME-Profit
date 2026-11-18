# 💚 FindMe Profit

Encontre negócios locais que ainda **não têm site**, calcule **quanto cobrar**,
organize suas **oportunidades de venda** e envie o **primeiro contato** com
mensagens prontas — tudo em um só lugar, do prospect ao "fechado!".

## O que já vem pronto

| Módulo | O que faz |
| --- | --- |
| 🏪 **Negócios** | Cadastro e importação em massa (CSV), filtro "só sem site", busca e cidades |
| 🔎 **Busca automática** | Escolha o ponto (GPS ou endereço/CEP) e o app **encontra negócios locais e importa sozinho** — via **Search Box da Mapbox**, com telefone, site e Instagram na ficha |
| 💰 **Calculadora** | Estimativa de preço por tipo de site (landing page, institucional, e-commerce…), páginas, extras e urgência — com valor sugerido e manutenção mensal |
| 🎯 **Oportunidades** | Pipeline kanban (Prospecção → Contatado → Negociando → Ganho/Perdido) com valor estimado por negócio |
| 💬 **Mensagens** | Templates de WhatsApp/e-mail com variáveis (`{{negocio}}`, `{{cidade}}`, `{{servico}}`, `{{valor}}`…) que o app preenche automaticamente |
| 📊 **Dashboard** | Métricas: negócios sem site, oportunidades abertas, valor no pipeline e valor ganho |

### Como funciona a busca automática

1. Em **Negócios**, escolha "Minha localização" (GPS com alta precisão, marca o
   **ponto exato** e identifica o **bairro**) ou "Por endereço ou cidade" —
   aceita cidade, bairro, rua **ou CEP** (com máscara que formata sozinho).
   A área pontilhada no mapa é exatamente o que será buscado.
2. O servidor consulta a **Search Box da Mapbox** (endpoint `/category`) por
   categoria ao redor do ponto — em lotes paralelos, leva poucos segundos — e
   importa **todos** os achados, já marcando quem tem site na ficha (link de
   Instagram vai para o campo Instagram, não conta como site).
3. A lista **reflete a busca atual**: os resultados que você não favoritou
   saem quando a próxima busca acontece. ⭐ **Favoritos persistem** entre
   buscas (assim como negócios com oportunidades).
4. Se a busca falha (ex.: sem internet), a lista anterior fica **intacta** —
   nada é apagado por um erro.

### Trava territorial: Minas Gerais

Por enquanto o app **só trabalha dentro de Minas Gerais**:

- o geocoding só aceita endereços de MG (região declarada pela Mapbox ou
  coordenada dentro da caixa do estado);
- GPS/clique no mapa fora de MG são rejeitados com aviso claro;
- a busca por categoria fica travada no estado inteiro.

Para expandir a cobertura, ajuste `MG_BBOX`/`MG_LOCK_MESSAGE`
(`apps/server/src/lib/providers/mapbox.ts`), `buildQuery` (que hoje só é usado
pelo provider legado de OSM) e `MG_HOME` (`apps/web/src/components/MapView.tsx`).

> Mapa feito com **Leaflet** + tiles da **Mapbox** (estilo escuro). Sem token
> válido, cai para tiles abertas da Esri — nada quebra.

### Mapbox (obrigatório — grátis até o limite do plano)

É a fonte dos negócios **e** o motor de geocoding/tiles:

1. Crie conta em [mapbox.com](https://www.mapbox.com/) (não pede cartão);
2. No painel, copie o **Default public token** (começa com `pk.`);
3. Cole no `.env` da raiz: `MAPBOX_ACCESS_TOKEN=pk.sua-token-aqui`;
4. Reinicie o servidor (`npm run dev`) — pronto.

A busca usa a Search Box API, cobrada **por requisição** no plano da Mapbox
(o uso pessoal fica dentro da franquia gratuita). Nenhuma chave de
OpenStreetMap ou Google é necessária.

## Stack

- **Backend:** Node.js + TypeScript, Express 5, SQLite (módulo nativo `node:sqlite` — sem dependências nativas)
- **Frontend:** React 19 + Vite 7 + Tailwind CSS 4
- **Compartilhado:** `@findme/shared` (tipos, catálogo de serviços e constantes)

## Como rodar

Requisitos: **Node.js ≥ 22.5** (o `node:sqlite` precisa disso).

```bash
npm install        # instala tudo (monorepo com workspaces)
npm run dev        # sobe API (:3001) + web (:5173) juntos
```

Abra **http://localhost:5173** — a API já está integrada pelo proxy do Vite.

Comandos individuais:

```bash
npm run dev:server   # só a API
npm run dev:web      # só o frontend
npm run build        # typecheck do servidor + build de produção do web
npm run seed:db      # (opcional) dados de exemplo — NÃO roda no boot
```

## Estrutura

```
FindMe Profit/
├── apps/
│   ├── server/        # API Express + SQLite
│   │   └── src/
│   │       ├── db/          # schema (o banco vive em src/data/, gitignored)
│   │       ├── lib/         # providers (mapbox, overpass legado), geocoding, precificação e parser CSV
│   │       ├── routes/      # businesses, opportunities, templates, misc (stats/pricing), search
│   │       └── index.ts
│   └── web/           # React + Vite + Tailwind
│       └── src/pages/ # Dashboard, Businesses, Opportunities, Calculator, Messages
└── packages/
    └── shared/        # tipos e constantes usados pelos dois lados
```

## Principais endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/businesses?semSite=1&q=&cidade=` | Lista com filtros |
| POST | `/api/businesses` | Cria negócio |
| POST | `/api/businesses/import` | Importa CSV em massa |
| GET | `/api/search/meta` | Categorias de busca + fonte ativa |
| POST | `/api/search/businesses` | **Busca automática**: encontra e importa negócios |
| GET/POST | `/api/opportunities` | Lista/cria oportunidades |
| PATCH | `/api/opportunities/:id/status` | Move no pipeline |
| POST | `/api/opportunities/:id/interactions` | Registra contato |
| POST | `/api/templates/render` | Preenche template com dados do negócio |
| POST | `/api/pricing/estimate` | Calculadora de preço |
| GET | `/api/stats` | Métricas do dashboard |

## Próximos passos sugeridos

- 👤 **Login simples** para usar em mais de um dispositivo
- 📄 **Gerador de proposta em PDF** com o valor da calculadora
- 📆 **Lembretes de follow-up** para oportunidades paradas há X dias
- 🗺️ Filtro por bairro/CEP na busca automática (raio menor, alvo mais preciso)

> O banco fica em `apps/server/src/data/findme.db` (**gitignored** — seus dados
> nunca sobem para o repositório). O app começa vazio: só cresce com o que
> você buscar, importar por CSV ou cadastrar.
