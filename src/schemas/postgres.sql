-- Neon PostgreSQL DDL schema with S-Z sharding products table

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Shard Lookup Table
CREATE TABLE IF NOT EXISTS product_shard_lookup (
    product_id VARCHAR(64) PRIMARY KEY, -- Unique ID (Mongo ObjectId, generated Cloudinary UUID, or Postgres generated UUID)
    product_name VARCHAR(255) NOT NULL,
    shard_name VARCHAR(32) NOT NULL CHECK (shard_name IN ('shard_a', 'shard_b', 'shard_c')),
    mongodb_collection VARCHAR(64) DEFAULT 'products',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_shard_lookup_name ON product_shard_lookup(product_name);

-- 3. Products S-Z Table (Products whose names start with S-Z)
CREATE TABLE IF NOT EXISTS products_sz (
    product_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    image_url VARCHAR(512) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    slug VARCHAR(255) NOT NULL UNIQUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_sz_name ON products_sz(name);
CREATE INDEX IF NOT EXISTS idx_products_sz_slug ON products_sz(slug);

-- 4. Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    total_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    shipping_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

-- 5. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id VARCHAR(64) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_per_unit DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- 6. Carts table
CREATE TABLE IF NOT EXISTS carts (
    cart_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Cart Items table
CREATE TABLE IF NOT EXISTS cart_items (
    cart_item_id VARCHAR(64) PRIMARY KEY,
    cart_id VARCHAR(64) NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
    product_id VARCHAR(64) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (cart_id, product_id)
);

-- 8. Inventory Transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
    transaction_id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL,
    quantity_change INTEGER NOT NULL,
    transaction_type VARCHAR(32) NOT NULL CHECK (transaction_type IN ('restock', 'sale', 'adjustment', 'return')),
    reference_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_transactions(product_id);
