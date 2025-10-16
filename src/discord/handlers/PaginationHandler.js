import { UIBuilder } from '../builders/UIBuilder.js';
import { Logger } from '../../utils/logger.js';
import { MessageFlags } from 'discord.js';

/**
 * Pagination handler for sound dashboard navigation
 * Handles Previous/Next page button interactions
 * Follows Single Responsibility Principle
 */
export class PaginationHandler {
  constructor(soundRepository) {
    this.soundRepository = soundRepository;
  }

  /**
   * Handle pagination button interactions
   * @param {Object} interaction - Discord button interaction
   */
  async handle(interaction) {
    try {
      const customId = interaction.customId;

      // Only handle pagination buttons
      if (!customId.startsWith('page_prev_') && !customId.startsWith('page_next_')) {
        Logger.warn('Non-pagination button received', {
          ...Logger.getUserContext(interaction),
          customId,
        });
        return;
      }

      // Extract page and mode from customId: page_prev_0_play or page_next_2_delete
      const parts = customId.split('_');
      const currentPage = parseInt(parts[2]);
      const mode = parts[3] || 'play'; // Default to 'play' if not specified

      let newPage = currentPage;
      if (customId.startsWith('page_prev_')) {
        newPage = currentPage - 1;
      } else if (customId.startsWith('page_next_')) {
        newPage = currentPage + 1;
      }

      Logger.info('Pagination button clicked', {
        ...Logger.getUserContext(interaction),
        currentPage,
        newPage,
        mode,
      });

      // Fetch sounds for this guild
      const sounds = await this.soundRepository.getSounds(interaction.guild.id);

      // Build the new page with the correct mode
      const { embed, components } = UIBuilder.buildSoundsDashboard(sounds, newPage, mode);

      // Update the message
      await interaction.update({
        embeds: [embed],
        components,
      });
    } catch (error) {
      Logger.error('Error in pagination handler', Logger.getUserContext(interaction), error);
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}
