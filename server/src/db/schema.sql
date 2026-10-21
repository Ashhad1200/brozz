-- Schema for the Brozz shop. Safe to run repeatedly.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE,
  password_hash   TEXT,
  name            TEXT,
  last_name       TEXT,
  phone_number    TEXT,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Guests get an anonymous user row so they can hold a cart before signing up.
  is_anonymous    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  phone_number   TEXT,
  address        TEXT NOT NULL,
  zip_code       TEXT NOT NULL,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  is_main        BOOLEAN NOT NULL DEFAULT FALSE,
  display_order  INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS addresses_user_idx ON addresses(user_id);

CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  model        TEXT NOT NULL,
  type         TEXT NOT NULL,
  collection   TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  fit          TEXT,
  base_sku     TEXT NOT NULL,
  sizes        TEXT[] NOT NULL DEFAULT '{}',
  tags         JSONB NOT NULL DEFAULT '[]',
  -- Pool of uploaded images the admin can assign to variants: [{id, name, src}]
  images       JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_collection_idx ON products(collection);

CREATE TABLE IF NOT EXISTS variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color          TEXT NOT NULL,
  color_display  TEXT,
  price          NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  actual_price   NUMERIC(10, 2) NOT NULL CHECK (actual_price >= 0),
  images         JSONB NOT NULL DEFAULT '[]',
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

CREATE TABLE IF NOT EXISTS skus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  size        TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  position    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS skus_variant_idx ON skus(variant_id);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku_id    UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity  INTEGER NOT NULL CHECK (quantity > 0),
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sku_id)
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email                TEXT,
  shipping_address_id  UUID REFERENCES addresses(id) ON DELETE SET NULL,
  shipping_option      JSONB NOT NULL DEFAULT '{"standard": false, "expedited": false}',
  shipping_cost        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  -- Snapshots, so later product or address edits don't rewrite order history.
  items             JSONB NOT NULL,
  shipping_address  JSONB NOT NULL,
  billing_address   JSONB NOT NULL,
  shipping_option   JSONB NOT NULL,
  shipping_cost     NUMERIC(10, 2) NOT NULL,
  subtotal          NUMERIC(10, 2) NOT NULL,
  total             NUMERIC(10, 2) NOT NULL,
  -- Only the cardholder name and last four digits are kept.
  payment_info      JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
