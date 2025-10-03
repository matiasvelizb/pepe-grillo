import { SlashCommandBuilder } from 'discord.js';

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
      const wasConnected = this.voiceService.disconnect(interaction.guild.id);

      if (!wasConnected) {
        return interaction.reply({
          content: "❌ I'm not playing anything right now!",
          ephemeral: true,
        });
      }

      await interaction.reply({
        content: '⏹️ Stopped playing and left the voice channel.',
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error in stop command:', error);
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}
