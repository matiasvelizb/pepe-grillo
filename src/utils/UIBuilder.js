import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config/config.js';

/**
 * Utility for building UI components
 * Follows Single Responsibility Principle - only handles UI construction
 */
export class UIBuilder {
  /**
   * Build dashboard embed and buttons for sounds
   * @param {Array} sounds - Array of sound records from database
   * @returns {Object} - {embed, components}
   */
  static buildSoundsDashboard(sounds) {
    const embed = new EmbedBuilder()
      .setTitle('🎵 Guild Sound Dashboard')
      .setDescription(
        `Your guild's saved sounds (${sounds.length}/${config.bot.maxSoundsPerGuild})`
      )
      .setColor(0x5865f2)
      .setTimestamp();

    if (sounds.length === 0) {
      embed.setDescription(
        '📭 No sounds saved yet! Use `/play` to add sounds to this guild.'
      );
      return { embed, components: [] };
    }

    // Create buttons (max 5 rows, 5 buttons per row = 25 max)
    const components = [];
    const buttonsPerRow = 5;
    const maxRows = 5;
    const maxButtons = maxRows * buttonsPerRow; // 25 buttons max

    // Limit sounds to display based on Discord's button constraints
    const soundsToDisplay = sounds.slice(0, maxButtons);

    for (let i = 0; i < soundsToDisplay.length; i += buttonsPerRow) {
      const row = new ActionRowBuilder();

      for (let j = i; j < Math.min(i + buttonsPerRow, soundsToDisplay.length); j++) {
        const sound = soundsToDisplay[j];

        // Clean up the title - remove "- Botón de sonido" and similar suffixes
        let cleanTitle = sound.title
          .replace(/\s*-\s*Botón de sonido\s*/gi, '')
          .replace(/\s*-\s*Instant Sound Button\s*/gi, '')
          .replace(/\s*\|\s*Myinstants\s*/gi, '')
          .trim();

        // Add number prefix (01, 02, etc.) for easy identification
        const soundNumber = String(j + 1).padStart(2, '0');
        let buttonLabel = `${soundNumber}. ${cleanTitle}`;

        // Truncate if too long (button labels max 80 chars)
        if (buttonLabel.length > 80) {
          // Keep the number and truncate the title
          const maxTitleLength = 80 - soundNumber.length - 4; // 4 for ". " and "..."
          cleanTitle = cleanTitle.substring(0, maxTitleLength);
          buttonLabel = `${soundNumber}. ${cleanTitle}...`;
        }

        const button = new ButtonBuilder()
          .setCustomId(`sound_${j}`)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔊');

        row.addComponents(button);
      }

      components.push(row);
    }

    return { embed, components };
  }
}
