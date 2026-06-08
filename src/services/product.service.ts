import mongoose from 'mongoose';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';
import { ProductShardRouter } from './shard-router.service';
import { cloudinaryService } from './cloudinary.service';
import { IProduct } from '../types';
import { getMongoShardAConnection, pgPool } from '../config/database';
import { ProductSchema } from '../schemas/product.schema';

export class ProductService {
  private productRepository = new ProductRepository();
  private lookupRepository = new LookupRepository();

  /**
   * Create a new product.
   */
  public async createProduct(productData: IProduct, imageBase64: string): Promise<IProduct> {
    // 1. Generate unique product ID
    const productId = new mongoose.Types.ObjectId().toString();

    // 2. Upload image to Cloudinary
    console.log('Uploading product image to Cloudinary...');
    const imageUrl = await cloudinaryService.uploadImage(imageBase64, 'products');
    
    // 3. Set imageUrl and slug
    const productSlug = productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const productPayload: IProduct = {
      ...productData,
      imageUrl,
      slug: productSlug,
      _id: productId
    };

    // 4. Resolve Shard based on Name starting letter
    const shardName = ProductShardRouter.getShardNameByName(productPayload.name);
    console.log(`Routing product "${productPayload.name}" to Shard: ${shardName}`);

    // 5. Store in the correct backend database (Mongo, Cloudinary JSON, or Neon Postgres)
    const createdProduct = await this.productRepository.create(shardName, productId, productPayload);

    // 6. Define the location parameter stored in Postgres lookup mapping
    let dbCollectionStr = 'products'; // For MongoDB (shard_a)
    if (shardName === 'shard_b') {
      // For Cloudinary (shard_b), we store the exact JSON file URL in PostgreSQL
      dbCollectionStr = createdProduct.imageUrl || 'cloudinary_raw';
      
      // Let's get the secure JSON URL
      const secureJsonUrl = await cloudinaryService.uploadProductJson(productId, productPayload);
      dbCollectionStr = secureJsonUrl;
    } else if (shardName === 'shard_c') {
      // For Postgres (shard_c), store table name
      dbCollectionStr = 'products_sz';
    }

    // 7. Save shard lookup mapping in Neon PostgreSQL
    console.log(`Saving Shard Lookup map index inside Neon PG...`);
    await this.lookupRepository.createLookup({
      product_id: productId,
      product_name: productPayload.name,
      shard_name: shardName,
      mongodb_collection: dbCollectionStr
    });

    // 8. Log inventory restock transaction
    const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await pgPool.query(
      `INSERT INTO inventory_transactions (transaction_id, product_id, quantity_change, transaction_type, reference_id) 
       VALUES ($1, $2, $3, 'restock', 'initial_stock')`,
      [txnId, productId, productPayload.stock]
    );

    return createdProduct;
  }

  /**
   * Fetch single product by ID.
   */
  public async getProductById(productId: string): Promise<IProduct> {
    const lookup = await this.lookupRepository.getLookupById(productId);
    if (!lookup) {
      throw new Error(`Product mapping with ID ${productId} not found in shard index.`);
    }

    const product = await this.productRepository.getById(
      lookup.shard_name, 
      productId, 
      lookup.mongodb_collection // Passes the Cloudinary JSON URL if shard_b
    );

    if (!product) {
      throw new Error(`Product data not found in shard: ${lookup.shard_name}`);
    }

    return product;
  }

  /**
   * Update product details (supporting cross-shard migration if the name alphabetical category shifts).
   */
  public async updateProduct(
    productId: string, 
    updates: Partial<IProduct>, 
    imageBase64?: string
  ): Promise<IProduct> {
    const lookup = await this.lookupRepository.getLookupById(productId);
    if (!lookup) {
      throw new Error(`Product mapping with ID ${productId} not found in shard index.`);
    }

    const currentShard = lookup.shard_name;
    const currentProduct = await this.productRepository.getById(currentShard, productId, lookup.mongodb_collection);
    if (!currentProduct) {
      throw new Error(`Product data not found in sharded cluster: ${currentShard}`);
    }

    // Handle image upload updates
    if (imageBase64) {
      console.log('Replacing product image on Cloudinary...');
      const newImageUrl = await cloudinaryService.uploadImage(imageBase64, 'products');
      if (currentProduct.imageUrl) {
        await cloudinaryService.deleteImage(currentProduct.imageUrl);
      }
      updates.imageUrl = newImageUrl;
    }

    // Handle name changes and sharding boundary shifts
    if (updates.name && updates.name !== currentProduct.name) {
      const newShard = ProductShardRouter.getShardNameByName(updates.name);
      updates.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

      if (newShard !== currentShard) {
        console.log(`Migration triggered: ${currentShard} -> ${newShard}`);

        const migratedPayload: IProduct = {
          name: updates.name,
          price: updates.price !== undefined ? updates.price : currentProduct.price,
          description: updates.description !== undefined ? updates.description : currentProduct.description,
          category: updates.category !== undefined ? updates.category : currentProduct.category,
          imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : currentProduct.imageUrl,
          stock: updates.stock !== undefined ? updates.stock : currentProduct.stock,
          slug: updates.slug,
          isFeatured: updates.isFeatured !== undefined ? updates.isFeatured : currentProduct.isFeatured,
          _id: productId
        };

        // 1. Save in the new storage shard
        const createdNew = await this.productRepository.create(newShard, productId, migratedPayload);

        // 2. Delete from the old storage shard
        await this.productRepository.delete(currentShard, productId);

        // 3. Determine new lookup location url/table
        let dbCollectionStr = 'products';
        if (newShard === 'shard_b') {
          const secureJsonUrl = await cloudinaryService.uploadProductJson(productId, migratedPayload);
          dbCollectionStr = secureJsonUrl;
        } else if (newShard === 'shard_c') {
          dbCollectionStr = 'products_sz';
        }

        // 4. Update index mapping in Postgres
        await this.lookupRepository.updateLookup(productId, updates.name, newShard, dbCollectionStr);

        return createdNew;
      } else {
        // Name changed but shard range remains identical
        let dbCollectionStr = lookup.mongodb_collection;
        if (currentShard === 'shard_b') {
          // Update details inside JSON and save back
          const updatedJson = { ...currentProduct, ...updates };
          dbCollectionStr = await cloudinaryService.uploadProductJson(productId, updatedJson);
        }
        
        await this.lookupRepository.updateLookup(productId, updates.name, currentShard, dbCollectionStr);
      }
    }

    // Standard update within the same storage engine
    const updated = await this.productRepository.update(currentShard, productId, updates, lookup.mongodb_collection);
    if (!updated) {
      throw new Error('Failed to update product details.');
    }

    // Record stock change transaction log
    if (updates.stock !== undefined && updates.stock !== currentProduct.stock) {
      const diff = updates.stock - currentProduct.stock;
      const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await pgPool.query(
        `INSERT INTO inventory_transactions (transaction_id, product_id, quantity_change, transaction_type, reference_id) 
         VALUES ($1, $2, $3, 'adjustment', 'stock_update')`,
        [txnId, productId, diff]
      );
    }

    return updated;
  }

  /**
   * Delete product.
   */
  public async deleteProduct(productId: string): Promise<void> {
    const lookup = await this.lookupRepository.getLookupById(productId);
    if (!lookup) {
      throw new Error(`Product mapping with ID ${productId} not found in shard index.`);
    }

    const product = await this.productRepository.getById(lookup.shard_name, productId, lookup.mongodb_collection);
    if (product && product.imageUrl) {
      await cloudinaryService.deleteImage(product.imageUrl);
    }

    // Delete from sharded database (includes deleting Cloudinary JSON if shard_b)
    await this.productRepository.delete(lookup.shard_name, productId);

    // Delete lookup index
    await this.lookupRepository.deleteLookup(productId);

    // Remove transactions
    await pgPool.query('DELETE FROM inventory_transactions WHERE product_id = $1', [productId]);
  }

  /**
   * List paginated products.
   */
  public async getProductsList(page: number, limit: number): Promise<{ products: IProduct[]; total: number }> {
    const offset = (page - 1) * limit;
    
    // Fetch mapped indices from Postgres
    const lookups = await this.lookupRepository.getAll(limit, offset);
    const total = await this.lookupRepository.countAll();

    // Group lookups by shard to fetch concurrently
    const groupA: string[] = []; // MongoDB
    const groupB: { id: string; url: string }[] = []; // Cloudinary
    const groupC: string[] = []; // Postgres

    lookups.forEach(l => {
      if (l.shard_name === 'shard_a') groupA.push(l.product_id);
      else if (l.shard_name === 'shard_b') groupB.push({ id: l.product_id, url: l.mongodb_collection });
      else if (l.shard_name === 'shard_c') groupC.push(l.product_id);
    });

    // Fetch Shard A in parallel
    const taskA = (async () => {
      if (groupA.length === 0) return [];
      const conn = getMongoShardAConnection();
      const ProductModel = conn.model('Product');
      return await ProductModel.find({ _id: { $in: groupA } }).exec();
    })();

    // Fetch Shard B in parallel
    const taskB = Promise.all(groupB.map(async (item) => {
      try {
        return await cloudinaryService.downloadProductJson(item.url);
      } catch {
        return null;
      }
    }));

    // Fetch Shard C in parallel
    const taskC = (async () => {
      if (groupC.length === 0) return [];
      const placeholders = groupC.map((_, i) => `$${i + 1}`).join(', ');
      const res = await pgPool.query(`SELECT * FROM products_sz WHERE product_id IN (${placeholders})`, groupC);
      return res.rows.map(row => ({
        _id: row.product_id,
        name: row.name,
        price: parseFloat(row.price),
        description: row.description,
        category: row.category,
        imageUrl: row.image_url,
        stock: row.stock,
        slug: row.slug,
        isFeatured: row.is_featured,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    })();

    const [resA, resB, resC] = await Promise.all([taskA, taskB, taskC]);

    // Map by ID to reconstruct pagination order
    const docMap = new Map<string, any>();
    resA.forEach((doc: any) => docMap.set(doc._id.toString(), doc.toObject()));
    resB.forEach((doc: any) => {
      if (doc) docMap.set(doc._id.toString(), doc);
    });
    resC.forEach((doc: any) => docMap.set(doc._id.toString(), doc));

    const sortedProducts: IProduct[] = [];
    lookups.forEach(l => {
      const doc = docMap.get(l.product_id);
      if (doc) sortedProducts.push(doc);
    });

    return { products: sortedProducts, total };
  }

  /**
   * Search and filter products.
   */
  public async searchProducts(params: {
    q?: string;
    category?: string;
    productId?: string;
    page: number;
    limit: number;
  }): Promise<{ products: IProduct[]; total: number }> {
    const skip = (params.page - 1) * params.limit;

    if (params.productId) {
      try {
        const product = await this.getProductById(params.productId);
        return { products: [product], total: 1 };
      } catch {
        return { products: [], total: 0 };
      }
    }

    if (params.q) {
      console.log(`Searching lookup table for: "${params.q}"`);
      const lookups = await this.lookupRepository.searchLookups(params.q, params.limit, skip);
      const total = await this.lookupRepository.countSearch(params.q);

      const groupA: string[] = [];
      const groupB: { id: string; url: string }[] = [];
      const groupC: string[] = [];

      lookups.forEach(l => {
        if (l.shard_name === 'shard_a') groupA.push(l.product_id);
        else if (l.shard_name === 'shard_b') groupB.push({ id: l.product_id, url: l.mongodb_collection });
        else if (l.shard_name === 'shard_c') groupC.push(l.product_id);
      });

      const taskA = (async () => {
        if (groupA.length === 0) return [];
        const conn = getMongoShardAConnection();
        const ProductModel = conn.model('Product');
        return await ProductModel.find({ _id: { $in: groupA } }).exec();
      })();

      const taskB = Promise.all(groupB.map(async (item) => {
        try {
          return await cloudinaryService.downloadProductJson(item.url);
        } catch {
          return null;
        }
      }));

      const taskC = (async () => {
        if (groupC.length === 0) return [];
        const placeholders = groupC.map((_, i) => `$${i + 1}`).join(', ');
        const res = await pgPool.query(`SELECT * FROM products_sz WHERE product_id IN (${placeholders})`, groupC);
        return res.rows.map(row => ({
          _id: row.product_id,
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          imageUrl: row.image_url,
          stock: row.stock,
          slug: row.slug,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
      })();

      const [resA, resB, resC] = await Promise.all([taskA, taskB, taskC]);

      const docMap = new Map<string, any>();
      resA.forEach((doc: any) => docMap.set(doc._id.toString(), doc.toObject()));
      resB.forEach((doc: any) => {
        if (doc) docMap.set(doc._id.toString(), doc);
      });
      resC.forEach((doc: any) => docMap.set(doc._id.toString(), doc));

      const sortedProducts: IProduct[] = [];
      lookups.forEach(l => {
        const doc = docMap.get(l.product_id);
        if (doc) sortedProducts.push(doc);
      });

      return { products: sortedProducts, total };
    }

    if (params.category) {
      console.log(`Searching category across shards: "${params.category}"`);
      // Fallback to query all databases and filter/aggregate since category is not sharded
      // 1. Fetch from Shard A
      const taskA = this.getShardAModel().find({ category: params.category }).exec();
      
      // 2. Fetch from Shard C
      const taskC = pgPool.query('SELECT * FROM products_sz WHERE category = $1', [params.category]);

      // 3. Fetch from Shard B
      const taskB = (async () => {
        const res = await pgPool.query("SELECT product_id, mongodb_collection FROM product_shard_lookup WHERE shard_name = 'shard_b'");
        const downloads = res.rows.map(async (row) => {
          try {
            return await cloudinaryService.downloadProductJson(row.mongodb_collection);
          } catch {
            return null;
          }
        });
        const docs = await Promise.all(downloads);
        return docs.filter(doc => doc !== null && doc.category === params.category) as IProduct[];
      })();

      const [resA, resC, resB] = await Promise.all([taskA, taskC, taskB]);

      const mergedList: IProduct[] = [];
      resA.forEach((doc: any) => mergedList.push(doc.toObject()));
      resB.forEach((doc: any) => mergedList.push(doc));
      resC.rows.forEach((row: any) => {
        mergedList.push({
          _id: row.product_id,
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          imageUrl: row.image_url,
          stock: row.stock,
          slug: row.slug,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      });

      // Paginatemerged list in memory
      const total = mergedList.length;
      const paginated = mergedList.slice(skip, skip + params.limit);
      return { products: paginated, total };
    }

    return await this.getProductsList(params.page, params.limit);
  }

  private getShardAModel() {
    const conn = getMongoShardAConnection();
    return conn.model('Product', ProductSchema);
  }
}
