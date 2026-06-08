import mongoose, { Connection } from 'mongoose';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL Connection Pool (Neon Postgres) - stores users, orders, shard lookup, and S-Z products
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT || '2000', 10),
  ssl: {
    rejectUnauthorized: false
  }
});

pgPool.on('error', (err) => {
  console.error('Unexpected error on PostgreSQL connection pool:', err);
});

// MongoDB Shard A Connection (A-I Products)
let mongoShardAConnection: Connection | null = null;

const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: parseInt(process.env.MONGO_POOL_MAX || '30', 10),
  minPoolSize: parseInt(process.env.MONGO_POOL_MIN || '3', 10),
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
};

export async function initializeDatabases(): Promise<{
  mongoShardA: Connection;
  postgresPool: Pool;
}> {
  if (mongoShardAConnection) {
    return { mongoShardA: mongoShardAConnection, postgresPool: pgPool };
  }

  const shardA_Url = process.env.MONGODB_SHARD_A_URI;
  if (!shardA_Url) {
    throw new Error('Missing MONGODB_SHARD_A_URI in environment configuration.');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing PostgreSQL DATABASE_URL in environment configuration.');
  }

  try {
    console.log('Connecting to PostgreSQL client pool...');
    await pgPool.query('SELECT NOW()');
    console.log('PostgreSQL Pool successfully warmed.');

    console.log('Initializing MongoDB Shard A Connection (A-I)...');
    mongoShardAConnection = mongoose.createConnection(shardA_Url, mongoOptions);

    await new Promise<void>((resolve, reject) => {
      mongoShardAConnection!.once('open', () => {
        console.log('MongoDB Shard A connected.');
        resolve();
      });
      mongoShardAConnection!.once('error', (err) => {
        console.error('MongoDB Shard A connection error:', err);
        reject(err);
      });
    });

    return { mongoShardA: mongoShardAConnection, postgresPool: pgPool };
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

export function getMongoShardAConnection(): Connection {
  if (!mongoShardAConnection) {
    throw new Error('MongoDB database has not been initialized. Call initializeDatabases() first.');
  }
  return mongoShardAConnection;
}
