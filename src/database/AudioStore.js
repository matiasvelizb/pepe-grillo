import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { rename, rm, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../config/config.js';

/**
 * Downloaded audio files on disk, one file per MyInstants sound URL.
 * Shared across guilds, so a sound is only downloaded once.
 */
export class AudioStore {
  constructor(dir = path.join(config.dataDir, 'audio')) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  pathFor(soundUrl) {
    const hash = createHash('sha1').update(soundUrl).digest('hex');
    return path.join(this.dir, `${hash}.mp3`);
  }

  has(soundUrl) {
    return existsSync(this.pathFor(soundUrl));
  }

  /**
   * Write atomically so a half-written file is never played
   * @returns {Promise<string>} - Path of the stored file
   */
  async save(soundUrl, buffer) {
    const file = this.pathFor(soundUrl);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, buffer);
    await rename(tmp, file);
    return file;
  }

  async remove(soundUrl) {
    await rm(this.pathFor(soundUrl), { force: true });
  }
}
