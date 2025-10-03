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

      for (let j = i; j < Math.min(i + buttonsPerRow, soundsToDisplayToDisplay.length); j++) {
        const sound = soundsToDisplay[j];

        // Truncate title if too long (button labels max 80 chars)
        let buttonLabel = sound.title;
        if (buttonLabel.length > 80) {
          buttonLabel = buttonLabel.substring(0, 77) + '...';
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
