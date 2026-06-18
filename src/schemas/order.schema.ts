import { Schema, Document } from 'mongoose';
import { IOrder } from '../types';

export interface IOrderDocument extends Omit<IOrder, 'created_at' | 'updated_at'>, Document {
  items: {
    product_id: string;
    quantity: number;
    price_per_unit: number;
  }[];
  created_at: Date;
  updated_at: Date;
}

export const OrderSchema = new Schema<IOrderDocument>({
  order_id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  payment_status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'pending' 
  },
  shipping_address: { type: String, required: true },
  items: [{
    product_id: { type: String, required: true },
    quantity: { type: Number, required: true },
    price_per_unit: { type: Number, required: true }
  }]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

OrderSchema.index({ user_id: 1 });
OrderSchema.index({ created_at: -1 });
