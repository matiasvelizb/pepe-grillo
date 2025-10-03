import { Logger } from '../utils/logger.js';

/**
 * Button interaction handler for playing sounds from the dashboard
 * Follows Single Responsibility Principle
 */
export class ButtonHandler {
  constructor(soundRepository, scraperService, voiceService) {
    this.soundRepository = soundRepository;
    this.scraperService = scraperService;
    this.voiceService = voiceService;
  }

  /**
   * Handle button interactions
   * @param {Object} interaction - Discord button interaction
   */
  async handle(interaction) {
    try {
      // Button customId format: "sound_0", "sound_1", etc.
      const soundIndex = parseInt(interaction.customId.split('_')[1]);

      Logger.info('Button interaction received', {
        ...Logger.getUserContext(interaction),
        soundIndex,
      });

      const sound = await this.soundRepository.getSoundByIndex(
        interaction.guild.id,
        soundIndex
      );

      if (!sound) {
        return interaction.reply({
          content: '❌ This sound is no longer available!',
          ephemeral: true,
        });
      }

      // Check if user is in a voice channel
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: '❌ You need to be in a voice channel first!',
          ephemeral: true,
        });
      }

      // Check bot permissions
      const permissions = voiceChannel.permissionsFor(interaction.client.user);
      if (!permissions.has('Connect') || !permissions.has('Speak')) {
        return interaction.reply({
          content:
            '❌ I need permissions to join and speak in your voice channel!',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // Download the sound
      let audioBuffer;
      try {
        audioBuffer = await this.scraperService.downloadSound(sound.sound_url);
        Logger.info('Downloaded sound from button', {
          ...Logger.getUserContext(interaction),
          title: sound.title,
          bufferSize: audioBuffer.length,
        });
      } catch (error) {
        Logger.error('Failed to download sound from button', Logger.getUserContext(interaction), error);
        return interaction.editReply(
          `❌ Failed to download sound: ${error.message}`
        );
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

        // Delete the status message after playing starts
        setTimeout(async () => {
          await interaction.deleteReply().catch(() => {});
        }, 2000);
      } catch (error) {
        Logger.error('Failed to play audio from button', Logger.getUserContext(interaction), error);

        let errorMessage = `❌ Failed to play audio: ${error.message}`;

        // Add helpful hints for common errors
        if (error.message.includes('encryption')) {
          errorMessage += '\n\n💡 **Encryption Error**: The bot is missing required audio encryption libraries (sodium/libsodium-wrappers/tweetnacl).';
        } else if (error.message.includes('permission')) {
          errorMessage += '\n\n💡 Make sure I have **Connect** and **Speak** permissions in your voice channel.';
        } else if (error.message.includes('EACCES')) {
          errorMessage += '\n\n💡 **Permission Error**: The bot cannot write temporary files.';
        }

        return interaction.editReply(errorMessage);
      }
    } catch (error) {
      Logger.error('Error in button interaction', Logger.getUserContext(interaction), error);
      const replyMethod = interaction.deferred ? 'editReply' : 'reply';
      await interaction[replyMethod]({
        content: `❌ An error occurred: ${error.message}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}
