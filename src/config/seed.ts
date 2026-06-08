import { pgPool } from './database';
import { ProductShardRouter } from '../services/shard-router.service';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';
import { initialProducts } from '../data/initialProducts';
import { cloudinaryService } from '../services/cloudinary.service';
import mongoose from 'mongoose';

const productRepository = new ProductRepository();
const lookupRepository = new LookupRepository();

export async function seedShardedDatabase() {
  try {
    console.log('Seeding process starting...');

    // 1. Initialize PostgreSQL Tables (including products_sz table!)
    console.log('Verifying PostgreSQL schema tables...');
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
          user_id VARCHAR(128) PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_shard_lookup (
          product_id VARCHAR(64) PRIMARY KEY,
          product_name VARCHAR(255) NOT NULL,
          shard_name VARCHAR(32) NOT NULL CHECK (shard_name IN ('shard_a', 'shard_b', 'shard_c')),
          mongodb_collection VARCHAR(512) DEFAULT 'products',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS order_items (
          order_item_id VARCHAR(64) PRIMARY KEY,
          order_id VARCHAR(64) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
          product_id VARCHAR(64) NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          price_per_unit DECIMAL(12, 2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS carts (
          cart_id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cart_items (
          cart_item_id VARCHAR(64) PRIMARY KEY,
          cart_id VARCHAR(64) NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
          product_id VARCHAR(64) NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          UNIQUE (cart_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_transactions (
          transaction_id VARCHAR(64) PRIMARY KEY,
          product_id VARCHAR(64) NOT NULL,
          quantity_change INTEGER NOT NULL,
          transaction_type VARCHAR(32) NOT NULL CHECK (transaction_type IN ('restock', 'sale', 'adjustment', 'return')),
          reference_id VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL schema tables verified.');

    // 2. Check if product lookup has records
    const lookupCheck = await pgPool.query('SELECT COUNT(*) FROM product_shard_lookup');
    const existingCount = parseInt(lookupCheck.rows[0].count, 10);

    if (existingCount > 0) {
      console.log(`Database already contains ${existingCount} sharded product lookups. Seeding skipped.`);
      return;
    }

    console.log(`No product lookup entries found. Splitting and seeding ${initialProducts.length} initial products...`);

    let countA = 0;
    let countB = 0;
    let countC = 0;

    for (const item of initialProducts) {
      const productId = new mongoose.Types.ObjectId().toString();
      const shardName = ProductShardRouter.getShardNameByName(item.name);
      
      const productPayload = {
        ...item,
        _id: productId
      };

      // Store in the correct shard storage
      await productRepository.create(shardName, productId, productPayload);

      // Define database location string stored in lookups
      let dbLocation = 'products';
      if (shardName === 'shard_b') {
        // Shard B (J-R) products uploaded as JSON files to Cloudinary
        const secureJsonUrl = await cloudinaryService.uploadProductJson(productId, productPayload);
        dbLocation = secureJsonUrl;
        countB++;
      } else if (shardName === 'shard_c') {
        dbLocation = 'products_sz';
        countC++;
      } else {
        countA++;
      }

      // Record sharding lookup
      await lookupRepository.createLookup({
        product_id: productId,
        product_name: item.name,
        shard_name: shardName,
        mongodb_collection: dbLocation
      });

      // Record inventory transaction log
      const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await pgPool.query(
        `INSERT INTO inventory_transactions (transaction_id, product_id, quantity_change, transaction_type, reference_id) 
         VALUES ($1, $2, $3, 'restock', 'initial_seed')`,
        [txnId, productId, item.stock]
      );
    }

    console.log(`Multi-cloud Seeding complete! Data successfully split and stored:`);
    console.log(` - Shard A (A-I) in MongoDB Atlas: ${countA} products`);
    console.log(` - Shard B (J-R) in Cloudinary raw JSON: ${countB} products`);
    console.log(` - Shard C (S-Z) in Neon PostgreSQL: ${countC} products`);

  } catch (error) {
    console.error('Failed to run database seeder:', error);
  }
}
