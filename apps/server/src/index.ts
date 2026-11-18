import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { businessesRouter } from './routes/businesses.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { templatesRouter } from './routes/templates.js';
import { miscRouter } from './routes/misc.js';
import { searchRouter } from './routes/search.js';
import './db/db.js';

// Carrega o .env da RAIZ do projeto (o cwd no workspace é apps/server, então
// subimos diretórios até encontrar o arquivo — sem isso as chaves nunca eram lidas)
{
  let dir = process.cwd();
  let envPath = path.join(dir, '.env');
  while (!existsSync(envPath) && path.dirname(dir) !== dir) {
    dir = path.dirname(dir);
    envPath = path.join(dir, '.env');
  }
  try {
    process.loadEnvFile(envPath);
  } catch {
    /* .env ausente é ok */
  }
}

const app = express();
app.use(express.json());

// CORS simples (o dev usa proxy do Vite, mas liberamos para testes diretos)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'findme-profit-api' });
});

app.use('/api/businesses', businessesRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/search', searchRouter);
app.use('/api', miscRouter);

// 404 para rotas de API desconhecidas
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Handler de erros: repassa a MENSAGEM do erro (app local — a mensagem
// amigável que lançamos, ex. Overpass fora do ar, chega intacta na UI)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno no servidor' });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`FindMe Profit API rodando em http://localhost:${PORT}`);
});
