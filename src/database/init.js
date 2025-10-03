import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './connection.js';
import { Logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeDatabase() {
  try {
    const pool = db.getPool();
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    await pool.query(schema);
    Logger.info('Database schema initialized successfully');
  } catch (error) {
    Logger.error('Failed to initialize database schema', {}, error);
    throw error;
  }
}
