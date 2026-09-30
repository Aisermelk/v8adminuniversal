-- V8 Admin Universal — catálogo: tags, vitrines e vínculo de loja.
-- Migração segura: não apaga nem recria produtos existentes.

CREATE TABLE IF NOT EXISTS catalog_tags (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_catalog_tags_project ON catalog_tags(project_id);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id TEXT NOT NULL, tag_id TEXT NOT NULL, project_id TEXT NOT NULL,
  PRIMARY KEY(product_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_product_tags_project ON product_tags(project_id);

CREATE TABLE IF NOT EXISTS vitrines (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_vitrines_project ON vitrines(project_id, active, display_order);

CREATE TABLE IF NOT EXISTS vitrine_products (
  project_id TEXT NOT NULL, vitrine_id TEXT NOT NULL, product_id TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(vitrine_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_vitrine_products_project ON vitrine_products(project_id, vitrine_id, display_order);

CREATE TABLE IF NOT EXISTS store_products (
  project_id TEXT NOT NULL, product_id TEXT NOT NULL, visible_in_store INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, available_for_sale INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_store_products_project ON store_products(project_id, display_order);
