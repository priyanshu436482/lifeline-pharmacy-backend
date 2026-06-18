import { Model } from 'mongoose';
import { getMongoShardAConnection } from '../config/database';
import { UserSchema, IUserDocument } from '../schemas/user.schema';
import { IUser } from '../types';

export class UserRepository {
  private getUserModel(): Model<IUserDocument> {
    const conn = getMongoShardAConnection();
    return conn.models.User as Model<IUserDocument> || conn.model<IUserDocument>('User', UserSchema);
  }

  public async findByEmail(email: string): Promise<IUser | null> {
    const UserModel = this.getUserModel();
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).exec();
    return doc ? doc.toObject() : null;
  }

  public async findById(userId: string): Promise<IUser | null> {
    const UserModel = this.getUserModel();
    const doc = await UserModel.findOne({ user_id: userId }).exec();
    return doc ? doc.toObject() : null;
  }

  public async findByGoogleId(googleId: string): Promise<IUser | null> {
    const UserModel = this.getUserModel();
    const doc = await UserModel.findOne({ google_id: googleId }).exec();
    return doc ? doc.toObject() : null;
  }

  public async createLocalUser(
    userId: string,
    email: string,
    passwordHash: string,
    firstName: string,
    lastName: string
  ): Promise<IUser> {
    const UserModel = this.getUserModel();
    const doc = new UserModel({
      user_id: userId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      auth_provider: 'local'
    });
    const saved = await doc.save();
    return saved.toObject();
  }

  public async createGoogleUser(
    userId: string,
    email: string,
    googleId: string,
    firstName: string,
    lastName: string,
    avatarUrl: string
  ): Promise<IUser> {
    const UserModel = this.getUserModel();
    const doc = new UserModel({
      user_id: userId,
      email: email.toLowerCase(),
      google_id: googleId,
      first_name: firstName,
      last_name: lastName,
      avatar_url: avatarUrl,
      auth_provider: 'google'
    });
    const saved = await doc.save();
    return saved.toObject();
  }

  public async linkGoogleAccount(
    userId: string,
    googleId: string,
    avatarUrl: string
  ): Promise<IUser> {
    const UserModel = this.getUserModel();
    const doc = await UserModel.findOneAndUpdate(
      { user_id: userId },
      { google_id: googleId, avatar_url: avatarUrl, auth_provider: 'both' },
      { new: true }
    ).exec();
    if (!doc) {
      throw new Error(`User not found with ID: ${userId}`);
    }
    return doc.toObject();
  }
}
