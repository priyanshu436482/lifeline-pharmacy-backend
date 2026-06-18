import { Model } from 'mongoose';
import { getMongoShardAConnection } from '../config/database';
import { ProductSchema, IProductDocument } from '../schemas/product.schema';
import { cloudinaryService } from '../services/cloudinary.service';
import { IProduct } from '../types';
import { LookupRepository } from './lookup.repository';

export class ProductRepository {
  private lookupRepository = new LookupRepository();

  private getShardAModel(): Model<IProductDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IProductDocument>('Product', ProductSchema);
  }

  private getShardBModel(): Model<IProductDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IProductDocument>('ProductJR', ProductSchema, 'products_jr');
  }

  private getShardCModel(): Model<IProductDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IProductDocument>('ProductSZ', ProductSchema, 'products_sz');
  }

  private getModelByShard(shardName: 'shard_a' | 'shard_b' | 'shard_c'): Model<IProductDocument> {
    switch (shardName) {
      case 'shard_a':
        return this.getShardAModel();
      case 'shard_b':
        return this.getShardBModel();
      case 'shard_c':
        return this.getShardCModel();
      default:
        throw new Error(`Invalid Shard name: ${shardName}`);
    }
  }

  public async create(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    productId: string,
    productData: IProduct,
    client?: any,
    options?: { skipCloudinary?: boolean }
  ): Promise<IProduct> {
    const productPayload = { ...productData, _id: productId };

    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        const doc = new ProductModel(productPayload);
        const saved = await doc.save();
        return saved.toObject();
      }

      case 'shard_b': {
        if (!options?.skipCloudinary) {
          console.log(`Writing product JSON file to Cloudinary for Shard B...`);
          await cloudinaryService.uploadProductJson(productId, {
            ...productPayload,
            version: 1,
          });
        }

        const ProductJRModel = this.getShardBModel();
        const doc = new ProductJRModel({
          ...productPayload,
          version: 1
        });
        const saved = await doc.save();
        return saved.toObject();
      }

      case 'shard_c': {
        console.log(`Writing product record to MongoDB products_sz for Shard C...`);
        const ProductSZModel = this.getShardCModel();
        const doc = new ProductSZModel(productPayload);
        const saved = await doc.save();
        return saved.toObject();
      }

      default:
        throw new Error(`Invalid Shard location specified: ${shardName}`);
    }
  }

  public async getById(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    productId: string,
    locationUrl?: string
  ): Promise<IProduct | null> {
    const Model = this.getModelByShard(shardName);
    const doc = await Model.findById(productId).exec();
    
    if (doc) {
      return doc.toObject();
    }

    if (shardName === 'shard_b' && locationUrl) {
      console.log(`Product not found in Shard B cache. Downloading from Cloudinary: ${locationUrl}`);
      try {
        const cloudinaryDoc = await cloudinaryService.downloadProductJson(locationUrl);
        return cloudinaryDoc;
      } catch (err) {
        console.error('Error downloading from Cloudinary:', err);
      }
    }

    return null;
  }

  public async getManyByIds(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    productIds: string[]
  ): Promise<IProduct[]> {
    if (productIds.length === 0) return [];
    const Model = this.getModelByShard(shardName);
    const docs = await Model.find({ _id: { $in: productIds } }).exec();
    return docs.map((doc) => doc.toObject());
  }

  public async update(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    productId: string,
    updates: Partial<IProduct>,
    locationUrl?: string,
    expectedVersion?: number
  ): Promise<IProduct | null> {
    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        const updatedDoc = await ProductModel.findByIdAndUpdate(productId, updates, { new: true }).exec();
        return updatedDoc ? updatedDoc.toObject() : null;
      }

      case 'shard_b': {
        const ProductJRModel = this.getShardBModel();
        const doc = await ProductJRModel.findById(productId).exec();
        if (!doc) {
          throw new Error('Shard B product not found in products_jr collection.');
        }

        const currentVersion = doc.version || 1;
        if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
          throw new Error('Concurrent update conflict: product was modified by another request.');
        }

        const updatedVersion = currentVersion + 1;
        const updatedDoc = await ProductJRModel.findByIdAndUpdate(
          productId,
          { ...updates, version: updatedVersion },
          { new: true }
        ).exec();

        if (!updatedDoc) {
          throw new Error('Failed to update Shard B product.');
        }

        const mergedProduct = updatedDoc.toObject();
        await cloudinaryService.uploadProductJson(productId, mergedProduct);
        return mergedProduct;
      }

      case 'shard_c': {
        const ProductSZModel = this.getShardCModel();
        const updatedDoc = await ProductSZModel.findByIdAndUpdate(productId, updates, { new: true }).exec();
        return updatedDoc ? updatedDoc.toObject() : null;
      }

      default:
        return null;
    }
  }

  public async delete(shardName: 'shard_a' | 'shard_b' | 'shard_c', productId: string): Promise<void> {
    const Model = this.getModelByShard(shardName);
    await Model.findByIdAndDelete(productId).exec();

    if (shardName === 'shard_b') {
      try {
        await cloudinaryService.deleteProductJson(productId);
      } catch (err) {
        console.error('Failed to delete Cloudinary JSON mirror:', err);
      }
    }
  }

  public async getByCategory(
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    category: string
  ): Promise<IProduct[]> {
    const Model = this.getModelByShard(shardName);
    const docs = await Model.find({ category }).exec();
    return docs.map((doc) => doc.toObject());
  }

  public async getCategoryCountsAcrossShards(): Promise<{ category: string; count: number }[]> {
    const categoryMap: Record<string, number> = {};

    const [resA, resB, resC] = await Promise.all([
      this.getShardAModel().aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]).exec(),
      this.getShardBModel().aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]).exec(),
      this.getShardCModel().aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]).exec(),
    ]);

    resA.forEach((item) => {
      categoryMap[item._id] = (categoryMap[item._id] || 0) + item.count;
    });
    resB.forEach((item) => {
      categoryMap[item._id] = (categoryMap[item._id] || 0) + item.count;
    });
    resC.forEach((item) => {
      categoryMap[item._id] = (categoryMap[item._id] || 0) + item.count;
    });

    return Object.keys(categoryMap).map((cat) => ({
      category: cat,
      count: categoryMap[cat],
    }));
  }

  public async getLowStockAcrossShards(threshold: number): Promise<IProduct[]> {
    const [resA, resB, resC] = await Promise.all([
      this.getShardAModel().find({ stock: { $lte: threshold } }).exec(),
      this.getShardBModel().find({ stock: { $lte: threshold } }).exec(),
      this.getShardCModel().find({ stock: { $lte: threshold } }).exec(),
    ]);

    const lowStockList: IProduct[] = [];
    resA.forEach((doc) => lowStockList.push(doc.toObject()));
    resB.forEach((doc) => lowStockList.push(doc.toObject()));
    resC.forEach((doc) => lowStockList.push(doc.toObject()));
    return lowStockList;
  }

  public async backfillShardBMirror(): Promise<number> {
    const lookups = await this.lookupRepository.getAll(1000, 0);
    const shardBLookups = lookups.filter((l) => l.shard_name === 'shard_b');

    let backfilled = 0;
    const ProductJRModel = this.getShardBModel();

    for (const lookup of shardBLookups) {
      const exists = await ProductJRModel.findById(lookup.product_id).exec();
      if (exists) continue;

      try {
        const doc = await cloudinaryService.downloadProductJson(lookup.mongodb_collection);
        const newDoc = new ProductJRModel({
          ...doc,
          _id: lookup.product_id,
          version: doc.version || 1,
        });
        await newDoc.save();
        backfilled++;
      } catch (error) {
        console.error(`Failed to backfill shard B product ${lookup.product_id}:`, error);
      }
    }
    return backfilled;
  }
}
