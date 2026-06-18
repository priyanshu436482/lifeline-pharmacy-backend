import { Model } from 'mongoose';
import { getMongoShardAConnection } from '../config/database';
import { LookupSchema, IShardLookupDocument } from '../schemas/lookup.schema';
import { IShardLookup } from '../types';

export class LookupRepository {
  private getLookupModel(): Model<IShardLookupDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IShardLookupDocument>('ProductLookup', LookupSchema);
  }

  public async createLookup(lookup: IShardLookup, client?: any): Promise<IShardLookup> {
    const LookupModel = this.getLookupModel();
    const doc = new LookupModel(lookup);
    const saved = await doc.save();
    return saved.toObject();
  }

  public async getLookupById(productId: string): Promise<IShardLookup | null> {
    const LookupModel = this.getLookupModel();
    const doc = await LookupModel.findOne({ product_id: productId }).exec();
    return doc ? doc.toObject() : null;
  }

  public async getLookupByName(productName: string): Promise<IShardLookup[]> {
    const LookupModel = this.getLookupModel();
    const docs = await LookupModel.find({ product_name: productName }).exec();
    return docs.map((doc) => doc.toObject());
  }

  public async updateLookup(
    productId: string,
    name: string,
    shardName: 'shard_a' | 'shard_b' | 'shard_c',
    collection: string,
    client?: any
  ): Promise<void> {
    const LookupModel = this.getLookupModel();
    await LookupModel.findOneAndUpdate(
      { product_id: productId },
      { product_name: name, shard_name: shardName, mongodb_collection: collection }
    ).exec();
  }

  public async deleteLookup(productId: string, client?: any): Promise<void> {
    const LookupModel = this.getLookupModel();
    await LookupModel.findOneAndDelete({ product_id: productId }).exec();
  }

  public async countAll(): Promise<number> {
    const LookupModel = this.getLookupModel();
    return await LookupModel.countDocuments().exec();
  }

  public async getAll(limit: number, offset: number): Promise<IShardLookup[]> {
    const LookupModel = this.getLookupModel();
    const docs = await LookupModel.find()
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
    return docs.map((doc) => doc.toObject());
  }

  public async searchLookups(searchQuery: string, limit: number, offset: number): Promise<IShardLookup[]> {
    const LookupModel = this.getLookupModel();
    const docs = await LookupModel.find({ product_name: { $regex: searchQuery, $options: 'i' } })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
    return docs.map((doc) => doc.toObject());
  }

  public async countSearch(searchQuery: string): Promise<number> {
    const LookupModel = this.getLookupModel();
    return await LookupModel.countDocuments({ product_name: { $regex: searchQuery, $options: 'i' } }).exec();
  }
}
