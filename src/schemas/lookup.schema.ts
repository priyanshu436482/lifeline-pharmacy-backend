import { Schema, Document } from 'mongoose';
import { IShardLookup } from '../types';

export interface IShardLookupDocument extends Omit<IShardLookup, 'created_at' | 'updated_at'>, Document {
  created_at: Date;
  updated_at: Date;
}

export const LookupSchema = new Schema<IShardLookupDocument>({
  product_id: { type: String, required: true, unique: true },
  product_name: { type: String, required: true },
  shard_name: { type: String, required: true, enum: ['shard_a', 'shard_b', 'shard_c'] },
  mongodb_collection: { type: String, required: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

LookupSchema.index({ product_name: 1 });
LookupSchema.index({ shard_name: 1 });
