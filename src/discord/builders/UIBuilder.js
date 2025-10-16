import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { config } from '../../config/config.js';

/**
 * Unified UI Builder for sound dashboards
 * Supports both BUTTONS and SELECT menu modes via configuration
 * Follows DRY principle - single source of truth for UI generation
 */
export class UIBuilder {
  /**
   * Build dashboard for sounds (play or delete mode)
   * @param {Array} sounds - Array of sound records from database
   * @param {number} currentPage - Current page number (0-indexed)
   * @param {string} mode - 'play' or 'delete'
   * @returns {Object} - {embed, components}
   */
  static buildSoundsDashboard(sounds, currentPage = 0, mode = 'play') {
    const uiType = config.bot.uiType;

    // Build embed (common for both UI types)
    const embed = this.buildEmbed(sounds, currentPage, mode);

    if (sounds.length === 0) {
      return { embed, components: [] };
    }

    // Build components based on UI type
    const components = uiType === 'SELECT'
      ? this.buildSelectComponents(sounds, currentPage, mode)
      : this.buildButtonComponents(sounds, currentPage, mode);

    return { embed, components };
  }

  /**
   * Build embed (shared across both UI types)
   * @private
   */
  static buildEmbed(sounds, currentPage, mode) {
    const soundsPerPage = 25;
    const totalPages = Math.ceil(sounds.length / soundsPerPage);
    currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

    const embed = new EmbedBuilder()
      .setTitle(mode === 'delete' ? '🗑️ Delete Sound' : '🎵 Guild Sound Dashboard')
      .setColor(mode === 'delete' ? 0xff4444 : 0x5865f2)
      .setTimestamp();

    if (sounds.length === 0) {
      embed.setDescription(
        mode === 'delete'
          ? '📭 No sounds to delete! Use `/play` to add sounds to this guild.'
          : '📭 No sounds saved yet! Use `/play` to add sounds to this guild.'
      );
    } else {
      embed.setDescription(
        `Your guild's saved sounds (${sounds.length}/${config.bot.maxSoundsPerGuild})\n` +
        (totalPages > 1 ? `📄 Page ${currentPage + 1} of ${totalPages}` : '')
      );
    }

    return embed;
  }

  /**
   * Build SELECT menu components
   * @private
   */
  static buildSelectComponents(sounds, currentPage, mode) {
    const soundsPerPage = 25;
    const totalPages = Math.ceil(sounds.length / soundsPerPage);
    currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

    const components = [];
    const startIndex = currentPage * soundsPerPage;
    const endIndex = Math.min(startIndex + soundsPerPage, sounds.length);
    const soundsOnPage = sounds.slice(startIndex, endIndex);

    // Create select menu
    const customId = mode === 'delete' ? `delete_select_page_${currentPage}` : `sound_select_page_${currentPage}`;
    const placeholder = mode === 'delete'
      ? `🗑️ Select a sound to delete (${startIndex + 1}-${endIndex} of ${sounds.length})`
      : `🎵 Select a sound to play (${startIndex + 1}-${endIndex} of ${sounds.length})`;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1);

    soundsOnPage.forEach((sound, index) => {
      const absoluteIndex = startIndex + index;
      const cleanTitle = this.cleanTitle(sound.title);
      const soundNumber = String(absoluteIndex + 1).padStart(3, '0');
      let optionLabel = `${soundNumber}. ${cleanTitle}`;

      if (optionLabel.length > 100) {
        optionLabel = `${soundNumber}. ${cleanTitle.substring(0, 100 - soundNumber.length - 7)}...`;
      }

      const option = new StringSelectMenuOptionBuilder()
        .setLabel(optionLabel)
        .setValue(mode === 'delete' ? `delete_${sound.id}` : `sound_${sound.id}`)
        .setEmoji(mode === 'delete' ? '🗑️' : '🔊');

      selectMenu.addOptions(option);
    });

    components.push(new ActionRowBuilder().addComponents(selectMenu));

    if (totalPages > 1) {
      components.push(this.buildPaginationRow(currentPage, totalPages, mode));
    }

    return components;
  }

  /**
   * Build button components (5x4 grid = 20 buttons + 1 pagination row = 5 rows total)
   * @private
   */
  static buildButtonComponents(sounds, currentPage, mode) {
    const soundsPerPage = 20; // 4 rows of 5 buttons each (Discord max is 5 action rows)
    const totalPages = Math.ceil(sounds.length / soundsPerPage);
    currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

    const components = [];
    const startIndex = currentPage * soundsPerPage;
    const endIndex = Math.min(startIndex + soundsPerPage, sounds.length);
    const soundsOnPage = sounds.slice(startIndex, endIndex);
    const buttonsPerRow = 5;

    for (let i = 0; i < soundsOnPage.length; i += buttonsPerRow) {
      const row = new ActionRowBuilder();

      for (let j = i; j < Math.min(i + buttonsPerRow, soundsOnPage.length); j++) {
        const sound = soundsOnPage[j];
        const absoluteIndex = startIndex + j;
        const cleanTitle = this.cleanTitle(sound.title);
        const soundNumber = String(absoluteIndex + 1).padStart(2, '0');
        let buttonLabel = `${soundNumber}. ${cleanTitle}`;

        if (buttonLabel.length > 80) {
          buttonLabel = `${soundNumber}. ${cleanTitle.substring(0, 80 - soundNumber.length - 7)}...`;
        }

        const button = new ButtonBuilder()
          .setCustomId(mode === 'delete' ? `delete_sound_${sound.id}` : `play_sound_${sound.id}`)
          .setLabel(buttonLabel)
          .setStyle(mode === 'delete' ? ButtonStyle.Danger : ButtonStyle.Primary)
          .setEmoji(mode === 'delete' ? '🗑️' : '🔊');

        row.addComponents(button);
      }

      components.push(row);
    }

    if (totalPages > 1) {
      components.push(this.buildPaginationRow(currentPage, totalPages, mode));
    }

    return components;
  }

  /**
   * Build pagination button row (shared across both UI types)
   * @private
   */
  static buildPaginationRow(currentPage, totalPages, mode) {
    const paginationRow = new ActionRowBuilder();

    const prevButton = new ButtonBuilder()
      .setCustomId(`page_prev_${currentPage}_${mode}`)
      .setLabel('◀️ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0);

    const pageButton = new ButtonBuilder()
      .setCustomId(`page_info_${currentPage}_${mode}`)
      .setLabel(`Page ${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const nextButton = new ButtonBuilder()
      .setCustomId(`page_next_${currentPage}_${mode}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1);

    paginationRow.addComponents(prevButton, pageButton, nextButton);
    return paginationRow;
  }

  /**
   * Clean up sound title (remove common suffixes)
   * @private
   */
  static cleanTitle(title) {
    return title
      .replace(/\s*-\s*Botón de sonido\s*/gi, '')
      .replace(/\s*-\s*Instant Sound Button\s*/gi, '')
      .replace(/\s*\|\s*Myinstants\s*/gi, '')
      .trim();
  }
}
