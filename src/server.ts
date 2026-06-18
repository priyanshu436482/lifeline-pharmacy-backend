import app from './app';
import { initializeDatabases } from './config/database';
import { seedShardedDatabase } from './config/seed';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log('Initializing LifeLine Pharmacy sharded databases (MongoDB + Cloudinary)...');
    await initializeDatabases();

    console.log('Running sharded database seed and schema initialization...');
    await seedShardedDatabase();

    console.log('Successfully connected to all database shards. Starting Express server...');
    const server = app.listen(PORT, () => {
      console.log(`[Server]: Lifeline Pharmacy backend running on http://localhost:${PORT}`);
    });

    const closeGracefully = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down server...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => closeGracefully('SIGINT'));
    process.on('SIGTERM', () => closeGracefully('SIGTERM'));

  } catch (error) {
    console.error('Critical failure: Server failed to start:', error);
    process.exit(1);
  }
}

startServer();
