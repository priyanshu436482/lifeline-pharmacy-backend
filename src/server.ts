import app from './app';
import { initializeDatabases } from './config/database';
import { seedShardedDatabase } from './config/seed';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log('Initializing lifeline pharmacy sharded databases (Mongo A-I, Postgres S-Z, Cloudinary J-R)...');
    const { postgresPool } = await initializeDatabases();

    console.log('Running sharded database seed and schema initialization...');
    await seedShardedDatabase();

    console.log('Successfully connected to all database shards. Starting Express server...');
    const server = app.listen(PORT, () => {
      console.log(`[Server]: Lifeline Pharmacy backend running on http://localhost:${PORT}`);
    });

    const closeGracefully = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down server and closing database pools...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          await postgresPool.end();
          console.log('PostgreSQL connection pool closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error closing databases during shutdown:', err);
          process.exit(1);
        }
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
