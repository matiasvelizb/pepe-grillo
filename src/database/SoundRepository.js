import { db } from '../database/connection.js';
import { config } from '../config/config.js';

/**
 * Repository for managing guild sounds in the database
 * Follows Repository Pattern for data access abstraction
 */
export class SoundRepository {
  /**
   * Add a new sound to a guild's collection
   * @param {string} guildId - Discord guild ID
   * @param {Object} soundData - Sound information
   * @returns {Promise<Object|null>} - Created sound record or null if duplicate
   */
  async addSound(guildId, soundData) {
    const pool = db.getPool();

    try {
      // Check if sound already exists for this guild
      const isDuplicate = await this.isDuplicate(guildId, soundData.soundUrl);
      if (isDuplicate) {
        console.log(`Sound already exists for guild ${guildId}: ${soundData.title}`);
        return null;
      }

      // Check if we need to remove oldest sound (keep max 20)
      const currentCount = await this.getCount(guildId);
      if (currentCount >= config.bot.maxSoundsPerGuild) {
        await this.removeOldest(guildId);
      }

      // Insert new sound
      const result = await pool.query(
        `INSERT INTO guild_sounds (guild_id, sound_url, title, original_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [guildId, soundData.soundUrl, soundData.title, soundData.originalUrl]
      );

      console.log(`✅ Added sound to guild ${guildId}: ${soundData.title}`);
      return result.rows[0];
    } catch (error) {
      console.error('Error adding sound to database:', error.message);
      throw error;
    }
  }

  /**
   * Get all sounds for a guild (most recent first)
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Array>} - Array of sound records
   */
  async getSounds(guildId) {
    const pool = db.getPool();

    try {
      const result = await pool.query(
        `SELECT * FROM guild_sounds
         WHERE guild_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [guildId, config.bot.maxSoundsPerGuild]
      );

      return result.rows;
    } catch (error) {
      console.error('Error fetching sounds from database:', error.message);
      throw error;
    }
  }

  /**
   * Check if a sound already exists for a guild
   * @param {string} guildId - Discord guild ID
   * @param {string} soundUrl - Direct URL to the audio file
   * @returns {Promise<boolean>} - True if duplicate exists
   */
  async isDuplicate(guildId, soundUrl) {
    const pool = db.getPool();

    try {
      const result = await pool.query(
        `SELECT COUNT(*) FROM guild_sounds
         WHERE guild_id = $1 AND sound_url = $2`,
        [guildId, soundUrl]
      );

      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('Error checking for duplicate sound:', error.message);
      throw error;
    }
  }

  /**
   * Get count of sounds for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<number>} - Count of sounds
   */
  async getCount(guildId) {
    const pool = db.getPool();

    try {
      const result = await pool.query(
        `SELECT COUNT(*) FROM guild_sounds WHERE guild_id = $1`,
        [guildId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting sound count:', error.message);
      throw error;
    }
  }

  /**
   * Remove the oldest sound for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<void>}
   */
  async removeOldest(guildId) {
    const pool = db.getPool();

    try {
      const result = await pool.query(
        `DELETE FROM guild_sounds
         WHERE id = (
           SELECT id FROM guild_sounds
           WHERE guild_id = $1
           ORDER BY created_at ASC
           LIMIT 1
         )
         RETURNING title`,
        [guildId]
      );

      if (result.rows.length > 0) {
        console.log(`🗑️  Removed oldest sound from guild ${guildId}: ${result.rows[0].title}`);
      }
    } catch (error) {
      console.error('Error removing oldest sound:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific sound by index (for button interactions)
   * @param {string} guildId - Discord guild ID
   * @param {number} index - Index of the sound (0-based)
   * @returns {Promise<Object|null>} - Sound record or null
   */
  async getSoundByIndex(guildId, index) {
    const sounds = await this.getSounds(guildId);
    return sounds[index] || null;
  }
}
