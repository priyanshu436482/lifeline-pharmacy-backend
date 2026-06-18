import { Schema, Document } from 'mongoose';
import { IUser } from '../types';

export interface IUserDocument extends Omit<IUser, 'created_at' | 'updated_at'>, Document {
  created_at: Date;
  updated_at: Date;
}

export const UserSchema = new Schema<IUserDocument>({
  user_id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  first_name: { type: String, required: false },
  last_name: { type: String, required: false },
  password_hash: { type: String, required: false },
  avatar_url: { type: String, required: false },
  google_id: { type: String, required: false },
  auth_provider: { type: String, default: 'local' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

UserSchema.index({ email: 1 });
UserSchema.index({ google_id: 1 });
