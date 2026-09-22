import { MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js';
import { UIBuilder } from '../builders/UIBuilder.js';

/**
 * Audio playback service with validation and error handling
 * Follows Single Responsibility Principle - only handles audio playback logic
 */
export class AudioService {
  constructor(scraperService, voiceService, cacheService) {
    this.scraperService = scraperService;
    this.voiceService = voiceService;
    this.cacheService = cacheService;
  }

  /**
   * Validate voice channel access and permissions
   * @param {Object} interaction - Discord interaction
   * @param {Object} play - PLAY log context ({ sound, via })
   * @returns {Object|null} - Voice channel if valid, null otherwise (reply sent)
   */
  async validateVoiceAccess(interaction, play = {}) {
    // Check if user is in a voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      Logger.activity('PLAY', 'ERROR', interaction, { ...play, reason: 'User not in a voice channel' });
      await interaction.reply({
        content: '❌ You need to be in a voice channel first!',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      Logger.activity('PLAY', 'ERROR', interaction, {
        ...play,
        channel: voiceChannel.name,
        reason: 'Missing Connect/Speak permission',
      });
      await interaction.reply({
        content: '❌ I need permissions to join and speak in your voice channel!',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }

    return voiceChannel;
  }

  /**
   * Download and play a sound in a voice channel
   * @param {Object} interaction - Discord interaction
   * @param {number|Object} soundIdOrVoiceChannel - Sound ID or voice channel
   * @param {Object} sound - Optional sound object (when called with voiceChannel)
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async playSound(interaction, soundIdOrVoiceChannel, sound = null) {
    const play = { via: typeof soundIdOrVoiceChannel === 'number' ? 'button' : 'select' };

    try {
      let voiceChannel;

      // Handle two calling patterns:
      // 1. playSound(interaction, soundId) - from button clicks (uses DB ID)
      // 2. playSound(interaction, voiceChannel, sound) - from select menu
      if (typeof soundIdOrVoiceChannel === 'number') {
        // Pattern 1: Called with soundId
        const soundId = soundIdOrVoiceChannel;

        // Validate voice access
        voiceChannel = await this.validateVoiceAccess(interaction, play);
        if (!voiceChannel) {
          return false; // Error reply already sent
        }

        // Defer reply since this takes time
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Fetch sound from database by ID
        const SoundRepository = (await import('../../database/SoundRepository.js')).SoundRepository;
        const soundRepo = new SoundRepository();
        sound = await soundRepo.getSoundById(interaction.guild.id, soundId);

        if (!sound) {
          Logger.activity('PLAY', 'ERROR', interaction, { ...play, reason: 'Sound not found' });
          await interaction.editReply('❌ Sound not found!');
          return false;
        }
      } else {
        // Pattern 2: Called with voiceChannel and sound
        voiceChannel = soundIdOrVoiceChannel;
      }

      play.sound = UIBuilder.cleanTitle(sound.title);
      play.channel = voiceChannel.name;

      // Try to get from cache first, download if cache miss
      let audioBuffer;
      let fromCache = false;
      try {
        // Check Redis cache first
        audioBuffer = await this.cacheService.getAudio(sound.sound_url);

        if (audioBuffer) {
          fromCache = true;
          Logger.debug('Retrieved sound from cache', {
            ...Logger.getUserContext(interaction),
            title: sound.title,
            bufferSize: audioBuffer.length,
          });
        } else {
          // Cache miss - download from MyInstants
          audioBuffer = await this.scraperService.downloadSound(sound.sound_url);
          Logger.debug('Downloaded sound from MyInstants (cache miss)', {
            ...Logger.getUserContext(interaction),
            title: sound.title,
            bufferSize: audioBuffer.length,
          });
        }
      } catch (error) {
        Logger.activity('PLAY', 'ERROR', interaction, { ...play, reason: `Download failed: ${error.message}` });
        await interaction.editReply(
          `❌ Failed to get sound: ${error.message}`
        );
        return false;
      }

      await interaction.editReply(`🔊 Playing: **${sound.title}**`);

      // Play the audio
      try {
        await this.voiceService.playAudio(
          voiceChannel,
          interaction.guild.id,
          interaction.guild.voiceAdapterCreator,
          audioBuffer,
          sound.title
        );
        Logger.activity('PLAY', 'OK', interaction, play);

        // Cache for next time AFTER playing starts (non-blocking)
        if (!fromCache) {
          this.cacheService.setAudio(sound.sound_url, audioBuffer).catch((error) => {
            Logger.error('Failed to cache audio (non-critical)', { soundUrl: sound.sound_url }, error);
          });
        }

        // Delete the status message after playing starts
        setTimeout(async () => {
          await interaction.deleteReply().catch(() => {});
        }, 2000);

        return true;
      } catch (error) {
        Logger.activity('PLAY', 'ERROR', interaction, { ...play, reason: error.message });

        let errorMessage = `❌ Failed to play audio: ${error.message}`;

        // Add helpful hints for common errors
        if (error.message.includes('encryption')) {
          errorMessage += '\n\n💡 **Encryption Error**: The bot is missing required audio encryption libraries (sodium/libsodium-wrappers/tweetnacl).';
        } else if (error.message.includes('permission')) {
          errorMessage += '\n\n💡 Make sure I have **Connect** and **Speak** permissions in your voice channel.';
        } else if (error.message.includes('EACCES')) {
          errorMessage += '\n\n💡 **Permission Error**: The bot cannot write temporary files.';
        }

        await interaction.editReply(errorMessage);
        return false;
      }
    } catch (error) {
      Logger.activity('PLAY', 'ERROR', interaction, { ...play, reason: error.message });
      return false;
    }
  }
}
