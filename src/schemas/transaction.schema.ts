import { Schema, Document } from 'mongoose';
import { IInventoryTransaction } from '../types';

export interface IInventoryTransactionDocument extends Omit<IInventoryTransaction, 'created_at'>, Document {
  created_at: Date;
}

export const TransactionSchema = new Schema<IInventoryTransactionDocument>({
  transaction_id: { type: String, required: true, unique: true },
  product_id: { type: String, required: true },
  quantity_change: { type: Number, required: true },
  transaction_type: { type: String, required: true, enum: ['restock', 'sale', 'adjustment', 'return'] },
  reference_id: { type: String, required: false }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

TransactionSchema.index({ product_id: 1 });
TransactionSchema.index({ created_at: -1 });
