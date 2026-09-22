import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js';

/**
 * Stop command - Stops playback and leaves voice channel
 */
export class StopCommand {
  constructor(voiceService) {
    this.voiceService = voiceService;
  }

  static get definition() {
    return new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop playing and leave the voice channel')
      .setContexts(InteractionContextType.Guild);
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      // Read the bot's channel before disconnecting
      const channel = interaction.guild.members.me?.voice?.channel?.name;
      const wasConnected = this.voiceService.disconnect(interaction.guild.id);

      if (!wasConnected) {
        Logger.activity('STOP', 'ERROR', interaction, { reason: 'Bot not connected' });
        return interaction.reply({
          content: "❌ I'm not playing anything right now!",
          flags: MessageFlags.Ephemeral,
        });
      }

      Logger.activity('STOP', 'OK', interaction, { channel });

      await interaction.reply({
        content: '⏹️ Stopped playing and left the voice channel.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.activity('STOP', 'ERROR', interaction, { reason: error.message });
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}
