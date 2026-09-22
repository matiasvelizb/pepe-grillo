import { config } from '../config/config.js';

const ORDER_BY = {
  popular: 'play_count DESC, created_at DESC, id DESC',
  recent: 'created_at DESC, id DESC',
};

/**
 * Guild sound library stored in SQLite
 */
export class SoundRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Add a sound to a guild. When the guild is over its limit, the oldest sounds are removed.
   * @param {string} guildId - Discord guild ID
   * @param {{soundUrl: string, title: string, originalUrl: string}} soundData
   * @returns {{sound: Object, created: boolean, removed: Object[]}}
   */
  add(guildId, { soundUrl, title, originalUrl }) {
    this.db.exec('BEGIN');
    try {
      const inserted = this.db.prepare(
        `INSERT INTO sounds (guild_id, sound_url, title, original_url)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, sound_url) DO NOTHING
         RETURNING *`
      ).get(guildId, soundUrl, title, originalUrl);

      const sound = inserted ?? this.db.prepare(
        'SELECT * FROM sounds WHERE guild_id = ? AND sound_url = ?'
      ).get(guildId, soundUrl);

      const removed = inserted ? this.trim(guildId) : [];

      this.db.exec('COMMIT');
      return { sound, created: Boolean(inserted), removed };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Remove the oldest sounds of a guild beyond the configured limit
   * @returns {Object[]} - Removed sound rows
   */
  trim(guildId) {
    const limit = config.bot.maxSoundsPerGuild;
    if (limit <= 0) return [];

    return this.db.prepare(
      `DELETE FROM sounds WHERE id IN (
         SELECT id FROM sounds WHERE guild_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT -1 OFFSET ?
       )
       RETURNING *`
    ).all(guildId, limit);
  }

  /**
   * One page of a guild's sounds
   * @param {string} guildId - Discord guild ID
   * @param {'popular'|'recent'} sort
   * @param {number} page - 0-indexed, clamped to the available pages
   * @param {number} pageSize
   * @returns {{sounds: Object[], total: number, page: number, pages: number}}
   */
  page(guildId, sort, page, pageSize) {
    const total = this.count(guildId);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(0, page), pages - 1);

    const sounds = this.db.prepare(
      `SELECT * FROM sounds WHERE guild_id = ?
       ORDER BY ${ORDER_BY[sort] ?? ORDER_BY.popular}
       LIMIT ? OFFSET ?`
    ).all(guildId, pageSize, page * pageSize);

    return { sounds, total, page, pages };
  }

  /**
   * Sounds whose title contains the text, most played first (all sounds when text is empty)
   */
  search(guildId, text, limit = 25) {
    const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    return this.db.prepare(
      `SELECT * FROM sounds
       WHERE guild_id = ? AND title LIKE ? ESCAPE '\\'
       ORDER BY ${ORDER_BY.popular}
       LIMIT ?`
    ).all(guildId, pattern, limit);
  }

  count(guildId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM sounds WHERE guild_id = ?').get(guildId).n;
  }

  getById(guildId, soundId) {
    return this.db.prepare('SELECT * FROM sounds WHERE guild_id = ? AND id = ?').get(guildId, soundId) ?? null;
  }

  /**
   * @returns {boolean} - True if deleted, false if not found
   */
  delete(guildId, soundId) {
    return this.db.prepare('DELETE FROM sounds WHERE guild_id = ? AND id = ?').run(guildId, soundId).changes > 0;
  }

  /**
   * Whether any guild still has this audio file saved
   */
  isAudioUsed(soundUrl) {
    return Boolean(this.db.prepare('SELECT 1 FROM sounds WHERE sound_url = ? LIMIT 1').get(soundUrl));
  }

  incrementPlays(soundId) {
    this.db.prepare('UPDATE sounds SET play_count = play_count + 1 WHERE id = ?').run(soundId);
  }
}
