-- V8 Admin Universal — catálogo unificado + base de pagamentos
-- Não apaga nem recria dados existentes. Executar como migração D1.

ALTER TABLE products ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN promo_price REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN category_id TEXT;
ALTER TABLE products ADD COLUMN subcategory TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN slug TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN meta_title TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN meta_description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN og_image TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
ALTER TABLE products ADD COLUMN height REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN width REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN length REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS catalog_categories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  category_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_project
  ON catalog_categories(project_id, deleted_at);

CREATE TABLE IF NOT EXISTS product_media (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_media_product
  ON product_media(product_id, sort_order);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  price REAL,
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS payment_integrations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  gateway TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'inactive',
  config_json TEXT NOT NULL DEFAULT '{}',
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, gateway)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  client_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  customer_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_project
  ON payment_orders(project_id, created_at);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  order_id TEXT,
  gateway TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  external_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_project
  ON payment_transactions(project_id, created_at);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  order_id TEXT,
  transaction_id TEXT,
  gateway TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_project
  ON payment_refunds(project_id, created_at);
