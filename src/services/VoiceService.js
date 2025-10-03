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
import { config } from '../config/config.js';

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
      tempFile = path.join(__dirname, '..', '..', 'temp', `temp_${Date.now()}.mp3`);
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
        console.log('♻️  Reusing existing voice connection');
      } else {
        // Join voice channel
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceAdapterCreator,
        });

        // Add error listener to connection
        connection.on('error', (error) => {
          console.error(`❌ Voice connection error for guild ${guildId}:`, error);
          console.error('Error name:', error.name);
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          console.log(`🔌 Voice connection disconnected for guild ${guildId}`);
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Reconnected successfully
          } catch (error) {
            console.log(`❌ Failed to reconnect, destroying connection for guild ${guildId}`);
            connection.destroy();
            this.connections.delete(guildId);
          }
        });

        // Wait for connection to be ready
        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (error) {
          console.error(`❌ Failed to join voice channel for guild ${guildId}:`, error);
          connection.destroy();
          await unlink(tempFile).catch(() => {});
          throw new Error(`Failed to join voice channel: ${error.message}`);
        }

        // Create audio player
        player = createAudioPlayer();

        // Add comprehensive error listener to player
        player.on('error', async (error) => {
          console.error(`❌ Audio player error for guild ${guildId}:`, error);
          console.error('Error name:', error.name);
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
          console.error('Resource:', error.resource);

          // Check for specific error types
          if (error.message.includes('encryption')) {
            console.error('🔒 ENCRYPTION ERROR DETECTED!');
            console.error('This usually means sodium/libsodium-wrappers/tweetnacl is missing');
          }

          await unlink(tempFile).catch(() => {});
          this.scheduleDisconnect(guildId);
        });

        // Store connection
        this.connections.set(guildId, { connection, player });
        console.log('🔗 Created new voice connection');
      }

      // Create audio resource
      const resource = createAudioResource(tempFile);

      // Play the audio
      player.play(resource);
      connection.subscribe(player);

      // Handle player events
      player.once(AudioPlayerStatus.Idle, async () => {
        console.log(`✅ Finished playing: ${soundTitle}`);
        await unlink(tempFile).catch(() => {});
        this.scheduleDisconnect(guildId);
      });

      console.log(`🔊 Playing: ${soundTitle}`);
    } catch (error) {
      // Clean up temp file if it exists
      if (tempFile) {
        await unlink(tempFile).catch(() => {});
      }

      // Log detailed error information
      console.error(`❌ Error in playAudio for guild ${guildId}:`, error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

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
    console.log(`⏹️  Disconnected from guild ${guildId}`);
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
        console.log(
          `⏰ Auto-disconnecting from guild ${guildId} after ${
            config.bot.autoDisconnectDelay / 60000
          } minutes of inactivity`
        );
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
