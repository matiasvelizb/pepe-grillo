import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { config } from '../../config/config.js';
import { Logger } from '../../utils/logger.js';

/**
 * Voice connections and playback, one session (connection + player) per guild
 */
export class VoiceService {
  constructor() {
    /** @type {Map<string, {connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, timer: NodeJS.Timeout|null}>} */
    this.sessions = new Map();
  }

  /**
   * Play an audio file in a voice channel, interrupting whatever is playing.
   * Moves the bot if it is connected to another channel of the same guild.
   * @param {Object} voiceChannel - Discord voice channel
   * @param {string} audioPath - Local audio file
   */
  async play(voiceChannel, audioPath) {
    const session = await this.connect(voiceChannel);
    clearTimeout(session.timer);
    session.player.play(createAudioResource(audioPath));
    Logger.logVoice('Started playing', voiceChannel.guild.id, { channel: voiceChannel.name });
  }

  /**
   * Join (or move to) a voice channel and wait until the connection is ready
   */
  async connect(voiceChannel) {
    const guildId = voiceChannel.guild.id;

    // Returns the existing connection when there is one, sending a move if the channel differs
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    let session = this.sessions.get(guildId);
    if (session?.connection !== connection) {
      session?.player.stop(true);
      session = this.createSession(guildId, connection);
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      this.disconnect(guildId);
      throw new Error(`Failed to join voice channel: ${error.message}`);
    }

    return session;
  }

  createSession(guildId, connection) {
    const player = createAudioPlayer();
    const session = { connection, player, timer: null };

    player.on('error', (error) => Logger.error('Audio player error', { guildId }, error));
    player.on(AudioPlayerStatus.Idle, () => this.scheduleDisconnect(guildId, session));

    connection.on('error', (error) => Logger.error('Voice connection error', { guildId }, error));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved or reconnecting: give it a moment to recover
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        Logger.warn('Voice connection lost, cleaning up', { guildId });
        connection.destroy();
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      player.stop(true); // Emits Idle synchronously, which schedules a timer; clear it right after
      clearTimeout(session.timer);
      if (this.sessions.get(guildId) === session) {
        this.sessions.delete(guildId);
      }
    });

    connection.subscribe(player);
    this.sessions.set(guildId, session);
    Logger.logVoice('Created voice connection', guildId);
    return session;
  }

  /**
   * Stop playing and leave the voice channel
   * @returns {boolean} - True if disconnected, false if not connected
   */
  disconnect(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    if (session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      session.connection.destroy(); // Destroyed listener cleans up the session
    }
    this.sessions.delete(guildId);
    Logger.logVoice('Disconnected from voice channel', guildId);
    return true;
  }

  disconnectAll() {
    for (const guildId of [...this.sessions.keys()]) {
      this.disconnect(guildId);
    }
  }

  scheduleDisconnect(guildId, session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      // A replaced session must not tear down the one that took its place
      if (this.sessions.get(guildId) !== session) return;
      Logger.logVoice('Auto-disconnecting after inactivity', guildId);
      this.disconnect(guildId);
    }, config.bot.autoDisconnectDelay);
  }
}
