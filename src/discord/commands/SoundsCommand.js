import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js';

/**
 * Sounds command - Shows dashboard of saved sounds for the guild
 * Follows Command Pattern
 */
export class SoundsCommand {
  constructor(soundRepository, dashboardService = null) {
    this.soundRepository = soundRepository;
    this.dashboardService = dashboardService;
  }

  /**
   * Get command definition
   */
  get definition() {
    return new SlashCommandBuilder()
      .setName('sounds')
      .setDescription('Show dashboard of saved sounds for this guild');
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      Logger.logCommand('sounds', interaction, {});

      // Use dashboard service if available (preferred)
      if (this.dashboardService) {
        await this.dashboardService.displayDashboard(interaction, 0, 'play');
      } else {
        // Fallback to inline implementation
        const { UIBuilder } = await import('../utils/UIBuilder.js');
        const sounds = await this.soundRepository.getSounds(interaction.guild.id);
        const { embed, components } = UIBuilder.buildSoundsDashboard(sounds, 0, 'play');

        await interaction.reply({
          embeds: [embed],
          components,
        });
      }

      Logger.info('Successfully displayed sounds dashboard', {
        ...Logger.getUserContext(interaction),
      });
    } catch (error) {
      Logger.error('Error in sounds command', Logger.getUserContext(interaction), error);
      await interaction.reply({
        content: '❌ Failed to show sounds dashboard!',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}
