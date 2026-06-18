import mongoose, { Connection } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

function resolveMongoShardAUri(): string | undefined {
  return (
    process.env.MONGODB_SHARD_A_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI
  );
}

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!resolveMongoShardAUri()) {
    missing.push('MONGODB_SHARD_A_URI (or MONGO_URI / MONGODB_URI)');
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    missing.push('CLOUDINARY_CLOUD_NAME');
  }
  if (!process.env.CLOUDINARY_API_KEY) {
    missing.push('CLOUDINARY_API_KEY');
  }
  if (!process.env.CLOUDINARY_API_SECRET) {
    missing.push('CLOUDINARY_API_SECRET');
  }
  return missing;
}

// MongoDB Shard A Connection (A-I Products, users, lookups, transactions, orders)
let mongoShardAConnection: Connection | null = null;

const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: parseInt(process.env.MONGO_POOL_MAX || '30', 10),
  minPoolSize: parseInt(process.env.MONGO_POOL_MIN || '3', 10),
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
};

export async function initializeDatabases(): Promise<{
  mongoShardA: Connection;
}> {
  if (mongoShardAConnection) {
    return { mongoShardA: mongoShardAConnection };
  }

  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. ` +
        'Add them in backend/.env locally or in Vercel → Project → Settings → Environment Variables, then redeploy.'
    );
  }

  const shardA_Url = resolveMongoShardAUri()!;

  try {
    console.log('Initializing MongoDB Shard Connection...');
    mongoShardAConnection = mongoose.createConnection(shardA_Url, mongoOptions);

    await new Promise<void>((resolve, reject) => {
      mongoShardAConnection!.once('open', () => {
        console.log('MongoDB successfully connected.');
        resolve();
      });
      mongoShardAConnection!.once('error', (err) => {
        console.error('MongoDB connection error:', err);
        reject(err);
      });
    });

    return { mongoShardA: mongoShardAConnection };
  } catch (error) {
    console.error('MongoDB database connection failed:', error);
    throw error;
  }
}

export function getMongoShardAConnection(): Connection {
  if (!mongoShardAConnection) {
    throw new Error('MongoDB database has not been initialized. Call initializeDatabases() first.');
  }
  return mongoShardAConnection;
}
