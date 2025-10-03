import { SlashCommandBuilder } from 'discord.js';
import { Logger } from '../utils/logger.js';

/**
 * Stop command - Stops playback and leaves voice channel
 * Follows Command Pattern
 */
export class StopCommand {
  constructor(voiceService) {
    this.voiceService = voiceService;
  }

  /**
   * Get command definition
   */
  get definition() {
    return new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop playing and leave the voice channel');
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      Logger.logCommand('stop', interaction);

      const wasConnected = this.voiceService.disconnect(interaction.guild.id);

      if (!wasConnected) {
        Logger.info('Stop command called but bot not connected', Logger.getUserContext(interaction));
        return interaction.reply({
          content: "❌ I'm not playing anything right now!",
          ephemeral: true,
        });
      }

      Logger.info('Successfully stopped playback and disconnected', Logger.getUserContext(interaction));

      await interaction.reply({
        content: '⏹️ Stopped playing and left the voice channel.',
        ephemeral: true,
      });
    } catch (error) {
      Logger.error('Error in stop command', Logger.getUserContext(interaction), error);
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}
