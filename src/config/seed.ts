import { getMongoShardAConnection } from './database';
import { ProductShardRouter } from '../services/shard-router.service';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';
import { initialProducts } from '../data/initialProducts';
import { cloudinaryService } from '../services/cloudinary.service';
import { TransactionSchema } from '../schemas/transaction.schema';
import mongoose from 'mongoose';

const productRepository = new ProductRepository();
const lookupRepository = new LookupRepository();

export async function seedShardedDatabase() {
  try {
    console.log('Seeding process starting...');

    const conn = getMongoShardAConnection();
    const TransactionModel = conn.model('InventoryTransaction', TransactionSchema, 'inventory_transactions');

    // 1. Backfill MongoDB JR cache
    const backfilled = await productRepository.backfillShardBMirror();
    if (backfilled > 0) {
      console.log(`Backfilled ${backfilled} Shard B products into MongoDB products_jr collection.`);
    }

    // 2. Check if product lookup has records in MongoDB
    const existingCount = await lookupRepository.countAll();

    if (existingCount > 0) {
      console.log(`Database already contains ${existingCount} sharded product lookups in MongoDB. Seeding skipped.`);
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

      let dbLocation = 'products';
      if (shardName === 'shard_b') {
        const secureJsonUrl = await cloudinaryService.uploadProductJson(productId, {
          ...productPayload,
          version: 1,
        });
        dbLocation = secureJsonUrl;
        await productRepository.create(shardName, productId, productPayload, undefined, { skipCloudinary: true });
        countB++;
      } else if (shardName === 'shard_c') {
        dbLocation = 'products_sz';
        await productRepository.create(shardName, productId, productPayload);
        countC++;
      } else {
        await productRepository.create(shardName, productId, productPayload);
        countA++;
      }

      await lookupRepository.createLookup({
        product_id: productId,
        product_name: item.name,
        shard_name: shardName,
        mongodb_collection: dbLocation
      });

      // Record inventory transaction log in MongoDB
      const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newTxn = new TransactionModel({
        transaction_id: txnId,
        product_id: productId,
        quantity_change: item.stock,
        transaction_type: 'restock',
        reference_id: 'initial_seed'
      });
      await newTxn.save();
    }

    console.log(`Multi-cloud MongoDB Seeding complete! Data successfully split and stored:`);
    console.log(` - Shard A (A-I) in MongoDB Atlas products: ${countA} products`);
    console.log(` - Shard B (J-R) in Cloudinary & MongoDB products_jr: ${countB} products`);
    console.log(` - Shard C (S-Z) in MongoDB products_sz: ${countC} products`);

  } catch (error) {
    console.error('Failed to run database seeder:', error);
  }
}
