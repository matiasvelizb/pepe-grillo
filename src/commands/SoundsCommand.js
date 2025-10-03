import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { UIBuilder } from '../utils/UIBuilder.js';
import { Logger } from '../utils/logger.js';

/**
 * Sounds command - Shows dashboard of saved sounds for the guild
 * Follows Command Pattern
 */
export class SoundsCommand {
  constructor(soundRepository) {
    this.soundRepository = soundRepository;
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
      console.log(`[Guild: ${interaction.guild.id}] Fetching sounds for /sounds command`);

      // Fetch sounds for this guild
      const sounds = await this.soundRepository.getSounds(interaction.guild.id);

      console.log(`[Guild: ${interaction.guild.id}] Found ${sounds.length} sounds, building dashboard`);

      // Build dashboard
      const { embed, components } = UIBuilder.buildSoundsDashboard(sounds);

      await interaction.reply({
        embeds: [embed],
        components,
      });

      console.log(`[Guild: ${interaction.guild.id}] Successfully displayed sounds dashboard with ${components.length} action rows`);
    } catch (error) {
      console.error(`[Guild: ${interaction.guild.id}] Error in sounds command:`, error);
      await interaction.reply({
        content: '❌ Failed to show sounds dashboard!',
        ephemeral: true,
      }).catch(() => {});
    }
  }
}
