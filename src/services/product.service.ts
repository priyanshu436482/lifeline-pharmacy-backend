import mongoose from 'mongoose';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';
import { ProductShardRouter } from './shard-router.service';
import { cloudinaryService } from './cloudinary.service';
import { withPgTransaction } from './shard-transaction.service';
import { IProduct } from '../types';
import { IShardLookup } from '../types';
import { getMongoShardAConnection } from '../config/database';
import { TransactionSchema } from '../schemas/transaction.schema';

export class ProductService {
  private productRepository = new ProductRepository();
  private lookupRepository = new LookupRepository();

  public async createProduct(productData: IProduct, imageBase64: string): Promise<IProduct> {
    const productId = new mongoose.Types.ObjectId().toString();

    const imageUrl = await cloudinaryService.uploadImage(imageBase64, 'products');
    const productSlug = productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const productPayload: IProduct = {
      ...productData,
      imageUrl,
      slug: productSlug,
      _id: productId,
    };

    const shardName = ProductShardRouter.getShardNameByName(productPayload.name);
    let dbCollectionStr = 'products';
    let createdProduct: IProduct;

    try {
      if (shardName === 'shard_b') {
        dbCollectionStr = await cloudinaryService.uploadProductJson(productId, {
          ...productPayload,
          version: 1,
        });

        createdProduct = await withPgTransaction(async (client) => {
          const product = await this.productRepository.create(shardName, productId, productPayload, client);
          await this.lookupRepository.createLookup(
            {
              product_id: productId,
              product_name: productPayload.name,
              shard_name: shardName,
              mongodb_collection: dbCollectionStr,
            },
            client
          );
          await this.logInventoryChange(client, productId, productPayload.stock, 'restock', 'initial_stock');
          return product;
        });
      } else if (shardName === 'shard_c') {
        dbCollectionStr = 'products_sz';
        createdProduct = await withPgTransaction(async (client) => {
          const product = await this.productRepository.create(shardName, productId, productPayload, client);
          await this.lookupRepository.createLookup(
            {
              product_id: productId,
              product_name: productPayload.name,
              shard_name: shardName,
              mongodb_collection: dbCollectionStr,
            },
            client
          );
          await this.logInventoryChange(client, productId, productPayload.stock, 'restock', 'initial_stock');
          return product;
        });
      } else {
        createdProduct = await this.productRepository.create(shardName, productId, productPayload);
        await withPgTransaction(async (client) => {
          await this.lookupRepository.createLookup(
            {
              product_id: productId,
              product_name: productPayload.name,
              shard_name: shardName,
              mongodb_collection: dbCollectionStr,
            },
            client
          );
          await this.logInventoryChange(client, productId, productPayload.stock, 'restock', 'initial_stock');
        });
      }
    } catch (error) {
      await this.compensateFailedCreate(shardName, productId, imageUrl);
      throw error;
    }

    return createdProduct;
  }

  public async getProductById(productId: string): Promise<IProduct> {
    const lookup = await this.lookupRepository.getLookupById(productId);
    if (!lookup) {
      throw new Error(`Product mapping with ID ${productId} not found in shard index.`);
    }

    const product = await this.productRepository.getById(
      lookup.shard_name,
      productId,
      lookup.mongodb_collection
    );

    if (!product) {
      throw new Error(`Product data not found in shard: ${lookup.shard_name}`);
    }

    return product;
  }

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
    const currentProduct = await this.productRepository.getById(
      currentShard,
      productId,
      lookup.mongodb_collection
    );
    if (!currentProduct) {
      throw new Error(`Product data not found in sharded cluster: ${currentShard}`);
    }

    if (imageBase64) {
      const newImageUrl = await cloudinaryService.uploadImage(imageBase64, 'products');
      if (currentProduct.imageUrl) {
        await cloudinaryService.deleteImage(currentProduct.imageUrl);
      }
      updates.imageUrl = newImageUrl;
    }

    if (updates.name && updates.name !== currentProduct.name) {
      updates.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const newShard = ProductShardRouter.getShardNameByName(updates.name);

      if (newShard !== currentShard) {
        return await this.migrateProductAcrossShards(
          productId,
          currentShard,
          newShard,
          currentProduct,
          updates,
          lookup
        );
      }

      await this.lookupRepository.updateLookup(
        productId,
        updates.name,
        currentShard,
        lookup.mongodb_collection
      );
    }

    const updated = await this.productRepository.update(
      currentShard,
      productId,
      updates,
      lookup.mongodb_collection,
      currentProduct.version
    );
    if (!updated) {
      throw new Error('Failed to update product details.');
    }

    if (updates.stock !== undefined && updates.stock !== currentProduct.stock) {
      await this.logInventoryChange(
        null,
        productId,
        updates.stock - currentProduct.stock,
        'adjustment',
        'stock_update'
      );
    }

    return updated;
  }

  public async deleteProduct(productId: string): Promise<void> {
    const lookup = await this.lookupRepository.getLookupById(productId);
    if (!lookup) {
      throw new Error(`Product mapping with ID ${productId} not found in shard index.`);
    }

    const product = await this.productRepository.getById(
      lookup.shard_name,
      productId,
      lookup.mongodb_collection
    );

    await withPgTransaction(async (client) => {
      await this.lookupRepository.deleteLookup(productId, client);
      await client.query('DELETE FROM inventory_transactions WHERE product_id = $1', [productId]);
      if (lookup.shard_name === 'shard_b') {
        await client.query('DELETE FROM products_jr WHERE product_id = $1', [productId]);
      } else if (lookup.shard_name === 'shard_c') {
        await client.query('DELETE FROM products_sz WHERE product_id = $1', [productId]);
      }
    });

    try {
      if (product?.imageUrl) {
        await cloudinaryService.deleteImage(product.imageUrl);
      }
      if (lookup.shard_name === 'shard_a') {
        await this.productRepository.delete('shard_a', productId);
      } else if (lookup.shard_name === 'shard_b') {
        await cloudinaryService.deleteProductJson(productId);
      }
    } catch (error) {
      console.error(`Shard data cleanup failed for ${productId}; lookup already removed:`, error);
      throw error;
    }
  }

  public async getProductsList(page: number, limit: number): Promise<{ products: IProduct[]; total: number }> {
    const offset = (page - 1) * limit;
    const [lookups, total] = await Promise.all([
      this.lookupRepository.getAll(limit, offset),
      this.lookupRepository.countAll(),
    ]);
    const products = await this.hydrateProductsFromLookups(lookups);
    return { products, total };
  }

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
      const [lookups, total] = await Promise.all([
        this.lookupRepository.searchLookups(params.q, params.limit, skip),
        this.lookupRepository.countSearch(params.q),
      ]);
      const products = await this.hydrateProductsFromLookups(lookups);
      return { products, total };
    }

    if (params.category) {
      const [shardA, shardB, shardC] = await Promise.all([
        this.productRepository.getByCategory('shard_a', params.category),
        this.productRepository.getByCategory('shard_b', params.category),
        this.productRepository.getByCategory('shard_c', params.category),
      ]);

      const mergedList = [...shardA, ...shardB, ...shardC].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      return {
        products: mergedList.slice(skip, skip + params.limit),
        total: mergedList.length,
      };
    }

    return await this.getProductsList(params.page, params.limit);
  }

  private async hydrateProductsFromLookups(lookups: IShardLookup[]): Promise<IProduct[]> {
    const groupA: string[] = [];
    const groupB: string[] = [];
    const groupC: string[] = [];

    lookups.forEach((l) => {
      if (l.shard_name === 'shard_a') groupA.push(l.product_id);
      else if (l.shard_name === 'shard_b') groupB.push(l.product_id);
      else if (l.shard_name === 'shard_c') groupC.push(l.product_id);
    });

    const [resA, resB, resC] = await Promise.all([
      this.productRepository.getManyByIds('shard_a', groupA),
      this.productRepository.getManyByIds('shard_b', groupB),
      this.productRepository.getManyByIds('shard_c', groupC),
    ]);

    const docMap = new Map<string, IProduct>();
    [...resA, ...resB, ...resC].forEach((doc) => docMap.set(String(doc._id), doc));

    return lookups
      .map((l) => docMap.get(l.product_id))
      .filter((doc): doc is IProduct => doc !== undefined);
  }

  private async migrateProductAcrossShards(
    productId: string,
    currentShard: 'shard_a' | 'shard_b' | 'shard_c',
    newShard: 'shard_a' | 'shard_b' | 'shard_c',
    currentProduct: IProduct,
    updates: Partial<IProduct>,
    lookup: IShardLookup
  ): Promise<IProduct> {
    const migratedPayload: IProduct = {
      name: updates.name!,
      price: updates.price !== undefined ? updates.price : currentProduct.price,
      description: updates.description !== undefined ? updates.description : currentProduct.description,
      category: updates.category !== undefined ? updates.category : currentProduct.category,
      imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : currentProduct.imageUrl,
      stock: updates.stock !== undefined ? updates.stock : currentProduct.stock,
      slug: updates.slug!,
      isFeatured: updates.isFeatured !== undefined ? updates.isFeatured : currentProduct.isFeatured,
      _id: productId,
    };

    let dbCollectionStr = 'products';
    let createdNew: IProduct = migratedPayload;

    try {
      if (newShard === 'shard_b') {
        dbCollectionStr = await cloudinaryService.uploadProductJson(productId, {
          ...migratedPayload,
          version: 1,
        });
      } else if (newShard === 'shard_c') {
        dbCollectionStr = 'products_sz';
      }

      await withPgTransaction(async (client) => {
        if (currentShard === 'shard_b') {
          await client.query('DELETE FROM products_jr WHERE product_id = $1', [productId]);
        } else if (currentShard === 'shard_c') {
          await client.query('DELETE FROM products_sz WHERE product_id = $1', [productId]);
        }

        if (newShard === 'shard_b' || newShard === 'shard_c') {
          createdNew = await this.productRepository.create(newShard, productId, migratedPayload, client);
        }

        await this.lookupRepository.updateLookup(
          productId,
          migratedPayload.name,
          newShard,
          dbCollectionStr,
          client
        );
      });

      if (newShard === 'shard_a') {
        createdNew = await this.productRepository.create(newShard, productId, migratedPayload);
      }

      if (currentShard === 'shard_a') {
        await this.productRepository.delete('shard_a', productId);
      } else if (currentShard === 'shard_b') {
        await cloudinaryService.deleteProductJson(productId);
      }
    } catch (error) {
      console.error(`Migration failed for ${productId}:`, error);
      throw error;
    }

    return createdNew;
  }

  private getTransactionModel() {
    const conn = getMongoShardAConnection();
    return conn.model('InventoryTransaction', TransactionSchema, 'inventory_transactions');
  }

  private async compensateFailedCreate(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    productId: string,
    imageUrl?: string
  ): Promise<void> {
    try {
      await this.productRepository.delete(shardName, productId);
      if (imageUrl) {
        await cloudinaryService.deleteImage(imageUrl);
      }
    } catch (cleanupError) {
      console.error(`Compensation cleanup failed for ${productId}:`, cleanupError);
    }
  }

  private async logInventoryChange(
    client: any,
    productId: string,
    quantityChange: number,
    type: 'restock' | 'adjustment',
    referenceId: string
  ): Promise<void> {
    const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const TransactionModel = this.getTransactionModel();
    const newTxn = new TransactionModel({
      transaction_id: txnId,
      product_id: productId,
      quantity_change: quantityChange,
      transaction_type: type,
      reference_id: referenceId
    });
    await newTxn.save();
  }

}
