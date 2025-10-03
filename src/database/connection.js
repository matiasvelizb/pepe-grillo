import pkg from 'pg';
import { config } from '../config/config.js';
import { Logger } from '../utils/logger.js';

const { Pool } = pkg;

class DatabaseConnection {
  constructor() {
    this.pool = null;
  }

  async connect() {
    if (this.pool) {
      return this.pool;
    }

    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
      await this.pool.query('SELECT NOW()');
      Logger.info('Database connected successfully', {
        host: config.database.host,
        database: config.database.name,
      });
    } catch (error) {
      Logger.error('Database connection failed', {}, error);
      throw error;
    }

    // Handle unexpected errors
    this.pool.on('error', (err) => {
      Logger.error('Unexpected database error', {}, err);
      process.exit(-1);
    });

    return this.pool;
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      Logger.info('Database disconnected');
    }
  }

  getPool() {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.pool;
  }
}

export const db = new DatabaseConnection();
