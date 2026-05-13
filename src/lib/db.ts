import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DB_DIR = process.env.DB_PATH || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'scopeforge.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initializeSchema(_db);
  }
  return _db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'box',
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      model_number TEXT,
      description TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      unit_type TEXT NOT NULL DEFAULT 'each',
      quantity_per_unit REAL DEFAULT 1,
      sku TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS labor_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rate_per_hour REAL NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assemblies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      default_labor_rate_id INTEGER REFERENCES labor_rates(id) ON DELETE SET NULL,
      default_labor_minutes REAL DEFAULT 0,
      default_multiplier REAL DEFAULT 1.0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assembly_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assembly_id INTEGER NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 1,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_company TEXT,
      customer_address TEXT,
      job_name TEXT NOT NULL,
      job_description TEXT,
      scope_of_work TEXT,
      notes TEXT,
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'flat',
      total REAL DEFAULT 0,
      share_token TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS quote_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      item_type TEXT NOT NULL DEFAULT 'product',
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      assembly_id INTEGER REFERENCES assemblies(id) ON DELETE SET NULL,
      labor_rate_id INTEGER REFERENCES labor_rates(id) ON DELETE SET NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit_type TEXT DEFAULT 'each',
      unit_price REAL DEFAULT 0,
      multiplier REAL DEFAULT 1.0,
      labor_minutes REAL DEFAULT 0,
      labor_rate_override REAL,
      line_total REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed default settings if not present
  const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get('initialized');
  if (!existing) {
    const pin = process.env.ADMIN_PIN || '1234';
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('admin_pin_hash', hashedPin);
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('company_name', process.env.COMPANY_NAME || 'Basic ITS');
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('initialized', 'true');
  }
}

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export function verifyPin(pin: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pin_hash') as { value: string } | undefined;
  if (!row) return false;
  return row.value === hashPin(pin);
}

export function generateQuoteNumber(db: Database.Database): string {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM quotes WHERE quote_number LIKE ?"
  ).get(`SF-${year}-%`) as { count: number };
  const num = (row?.count || 0) + 1;
  return `SF-${year}-${String(num).padStart(4, '0')}`;
}

export function generateShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}
