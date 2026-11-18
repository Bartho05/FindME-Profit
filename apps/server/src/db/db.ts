import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'findme.db'));

// Espera até 5s por locks de outros processos — evita o crash "database is
// locked" quando o tsx watch reinicia enquanto uma instância velha ainda
// está fechando o banco.
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  instagram TEXT,
  has_website INTEGER NOT NULL DEFAULT 0,
  website_url TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospect',
  estimated_value REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migração: coluna de favoritos + coordenadas (para o mapa)
const bizCols = db.prepare('PRAGMA table_info(businesses)').all() as Array<{ name: string }>;
if (!bizCols.some((c) => c.name === 'favorite')) {
  db.exec('ALTER TABLE businesses ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;');
}
for (const col of ['lat', 'lng'] as const) {
  if (!bizCols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE businesses ADD COLUMN ${col} REAL;`);
  }
}

export default db;
