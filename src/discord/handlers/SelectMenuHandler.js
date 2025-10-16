import { MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js';

/**
 * Select menu handler for playing sounds from the dashboard
 * Handles sound selection from dropdown menus
 * Follows Single Responsibility Principle
 */
export class SelectMenuHandler {
  constructor(soundRepository, audioService) {
    this.soundRepository = soundRepository;
    this.audioService = audioService;
  }

  /**
   * Handle select menu interactions
   * @param {Object} interaction - Discord select menu interaction
   */
  async handle(interaction) {
    try {
      // Select menu customId format: "sound_select_page_0", "sound_select_page_1", etc.
      // Selected value format: "sound_123" (where 123 is the DB sound ID)
      const selectedValue = interaction.values[0];
      const soundId = parseInt(selectedValue.split('_')[1]);

      Logger.info('Sound selected from menu', {
        ...Logger.getUserContext(interaction),
        soundId,
      });

      // Fetch the sound by ID
      const sound = await this.soundRepository.getSoundById(
        interaction.guild.id,
        soundId
      );

      if (!sound) {
        return interaction.reply({
          content: '❌ This sound is no longer available!',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Validate voice access
      const voiceChannel = await this.audioService.validateVoiceAccess(interaction);
      if (!voiceChannel) {
        return; // Error reply already sent
      }

      // Defer reply since playback takes time
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Play the sound
      await this.audioService.playSound(interaction, voiceChannel, sound);

    } catch (error) {
      Logger.error('Error in select menu handler', Logger.getUserContext(interaction), error);
      const replyMethod = interaction.deferred ? 'editReply' : 'reply';
      await interaction[replyMethod]({
        content: `❌ An error occurred: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}
