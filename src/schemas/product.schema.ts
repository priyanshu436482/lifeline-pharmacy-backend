import { Schema, Document } from 'mongoose';
import { IProduct } from '../types';

export interface IProductDocument extends Omit<IProduct, '_id'>, Document {}

export const ProductSchema = new Schema<IProductDocument>({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, required: false },
  category: { type: String, required: true, trim: true },
  imageUrl: { type: String, required: true },
  stock: { type: Number, required: true, min: 0, default: 0 },
  slug: { type: String, required: true, trim: true },
  isFeatured: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.index({ category: 1 });
ProductSchema.index({ slug: 1 });
ProductSchema.index({ name: 1 });
