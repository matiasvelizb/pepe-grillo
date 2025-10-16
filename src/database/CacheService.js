import { createClient } from 'redis';
import { config } from '../config/config.js';
import { Logger } from '../utils/logger.js';

/**
 * Redis cache service for audio files
 * Caches downloaded audio buffers to avoid re-downloading from MyInstants
 */
export class CacheService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      this.client = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
        },
      });

      this.client.on('error', (err) => {
        Logger.error('Redis client error', {}, err);
      });

      this.client.on('connect', () => {
        Logger.debug('Redis client connecting...');
      });

      this.client.on('ready', () => {
        this.connected = true;
        Logger.info('Redis cache connected successfully');
      });

      await this.client.connect();
    } catch (error) {
      Logger.error('Failed to connect to Redis cache', {}, error);
      this.connected = false;
      // Don't throw - bot should work without cache
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      Logger.info('Redis cache disconnected');
    }
  }

  /**
   * Generate cache key for a sound
   * @param {string} soundUrl - MyInstants sound URL
   * @returns {string} Cache key
   */
  getCacheKey(soundUrl) {
    return `audio:${soundUrl}`;
  }

  /**
   * Get cached audio buffer
   * @param {string} soundUrl - MyInstants sound URL
   * @returns {Promise<Buffer|null>} Audio buffer or null if not cached
   */
  async getAudio(soundUrl) {
    if (!this.connected) {
      Logger.debug('Redis not connected, skipping cache read');
      return null;
    }

    try {
      const key = this.getCacheKey(soundUrl);
      const cached = await this.client.get(key);

      if (cached) {
        Logger.debug('Cache HIT for audio', { soundUrl, size: cached.length });
        // Redis returns string, convert back to Buffer
        return Buffer.from(cached, 'base64');
      }

      Logger.debug('Cache MISS for audio', { soundUrl });
      return null;
    } catch (error) {
      Logger.error('Error reading from cache', { soundUrl }, error);
      return null;
    }
  }

  /**
   * Cache audio buffer
   * @param {string} soundUrl - MyInstants sound URL
   * @param {Buffer} audioBuffer - Audio data
   * @param {number} ttl - Time to live in seconds (default: 7 days)
   */
  async setAudio(soundUrl, audioBuffer, ttl = 604800) {
    if (!this.connected) {
      Logger.debug('Redis not connected, skipping cache write');
      return;
    }

    try {
      const key = this.getCacheKey(soundUrl);
      // Convert Buffer to base64 string for Redis
      const base64 = audioBuffer.toString('base64');

      await this.client.set(key, base64, {
        EX: ttl, // Expire after TTL seconds (default: 7 days)
      });

      Logger.debug('Cached audio', {
        soundUrl,
        size: audioBuffer.length,
        ttl: `${ttl}s`,
      });
    } catch (error) {
      Logger.error('Error writing to cache', { soundUrl }, error);
    }
  }

  /**
   * Clear cached audio for a specific sound
   * @param {string} soundUrl - MyInstants sound URL
   */
  async clearAudio(soundUrl) {
    if (!this.connected) {
      return;
    }

    try {
      const key = this.getCacheKey(soundUrl);
      await this.client.del(key);
      Logger.debug('Cleared cached audio', { soundUrl });
    } catch (error) {
      Logger.error('Error clearing cache', { soundUrl }, error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    if (!this.connected) {
      return { connected: false };
    }

    try {
      const info = await this.client.info('stats');
      const keys = await this.client.keys('audio:*');

      return {
        connected: true,
        cachedSounds: keys.length,
        info,
      };
    } catch (error) {
      Logger.error('Error getting cache stats', {}, error);
      return { connected: true, error: error.message };
    }
  }
}
