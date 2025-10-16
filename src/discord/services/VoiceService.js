import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/config.js';
import { Logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for managing voice connections and audio playback
 * Follows Single Responsibility Principle - only handles voice/audio operations
 */
export class VoiceService {
  constructor() {
    // Store active voice connections per guild
    this.connections = new Map();
    // Store disconnect timers for auto-disconnect
    this.disconnectTimers = new Map();
  }

  /**
   * Play audio in a voice channel
   * @param {Object} voiceChannel - Discord voice channel
   * @param {string} guildId - Guild ID
   * @param {Object} voiceAdapterCreator - Voice adapter creator
   * @param {Buffer} audioBuffer - Audio data buffer
   * @param {string} soundTitle - Title of the sound
   * @returns {Promise<void>}
   */
  async playAudio(voiceChannel, guildId, voiceAdapterCreator, audioBuffer, soundTitle) {
    let tempFile;

    try {
      // Save to temporary file
      tempFile = path.join(__dirname, '..', '..', '..', 'temp', `temp_${Date.now()}.mp3`);
      const writeStream = createWriteStream(tempFile);
      writeStream.write(audioBuffer);
      writeStream.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Check if we already have an active connection
      let connectionData = this.connections.get(guildId);
      let connection;
      let player;

      if (
        connectionData &&
        connectionData.connection.state.status !== VoiceConnectionStatus.Destroyed
      ) {
        // Reuse existing connection
        connection = connectionData.connection;
        player = connectionData.player;
        Logger.logVoice('Reusing existing voice connection', guildId, {
          soundTitle,
        });
      } else {
        // Join voice channel
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceAdapterCreator,
        });

        // Add error listener to connection
        connection.on('error', (error) => {
          Logger.error('Voice connection error', { guildId }, error);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          Logger.logVoice('Voice connection disconnected', guildId);
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Reconnected successfully
          } catch (error) {
            Logger.warn('Failed to reconnect, destroying connection', { guildId });
            connection.destroy();
            this.connections.delete(guildId);
          }
        });

        // Wait for connection to be ready
        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (error) {
          Logger.error('Failed to join voice channel', { guildId }, error);
          connection.destroy();
          await unlink(tempFile).catch(() => {});
          throw new Error(`Failed to join voice channel: ${error.message}`);
        }

        // Create audio player
        player = createAudioPlayer();

        // Add comprehensive error listener to player
        player.on('error', async (error) => {
          Logger.error('Audio player error', { guildId }, error);

          // Check for specific error types
          if (error.message.includes('encryption')) {
            Logger.error('Encryption error detected - missing sodium/libsodium-wrappers/tweetnacl', { guildId });
          }

          await unlink(tempFile).catch(() => {});
          this.scheduleDisconnect(guildId);
        });

        // Store connection
        this.connections.set(guildId, { connection, player });
        Logger.logVoice('Created new voice connection', guildId);
      }

      // Create audio resource
      const resource = createAudioResource(tempFile);

      // Play the audio
      player.play(resource);
      connection.subscribe(player);

      // Handle player events
      player.once(AudioPlayerStatus.Idle, async () => {
        Logger.logVoice('Finished playing sound', guildId, { soundTitle });
        await unlink(tempFile).catch(() => {});
        this.scheduleDisconnect(guildId);
      });

      Logger.logVoice('Started playing sound', guildId, {
        soundTitle,
        tempFile: path.basename(tempFile),
      });
    } catch (error) {
      // Clean up temp file if it exists
      if (tempFile) {
        await unlink(tempFile).catch(() => {});
      }

      // Log detailed error information
      Logger.error('Error in playAudio', { guildId }, error);

      // Re-throw with user-friendly message
      throw new Error(`Failed to play audio: ${error.message}`);
    }
  }

  /**
   * Stop playing and disconnect from voice channel
   * @param {string} guildId - Guild ID
   * @returns {boolean} - True if disconnected, false if not connected
   */
  disconnect(guildId) {
    const connectionData = this.connections.get(guildId);

    if (!connectionData) {
      return false;
    }

    // Clear disconnect timer
    if (this.disconnectTimers.has(guildId)) {
      clearTimeout(this.disconnectTimers.get(guildId));
      this.disconnectTimers.delete(guildId);
    }

    connectionData.connection.destroy();
    this.connections.delete(guildId);
    Logger.logVoice('Disconnected from voice channel', guildId);
    return true;
  }

  /**
   * Schedule automatic disconnect after inactivity
   * @param {string} guildId - Guild ID
   */
  scheduleDisconnect(guildId) {
    // Clear existing timer if any
    if (this.disconnectTimers.has(guildId)) {
      clearTimeout(this.disconnectTimers.get(guildId));
    }

    // Schedule disconnect after configured delay
    const timer = setTimeout(() => {
      const connectionData = this.connections.get(guildId);
      if (connectionData) {
        Logger.logVoice('Auto-disconnecting after inactivity', guildId, {
          inactivityMinutes: config.bot.autoDisconnectDelay / 60000,
        });
        connectionData.connection.destroy();
        this.connections.delete(guildId);
        this.disconnectTimers.delete(guildId);
      }
    }, config.bot.autoDisconnectDelay);

    this.disconnectTimers.set(guildId, timer);
  }

  /**
   * Check if bot is connected to a voice channel in a guild
   * @param {string} guildId - Guild ID
   * @returns {boolean}
   */
  isConnected(guildId) {
    return this.connections.has(guildId);
  }
}
