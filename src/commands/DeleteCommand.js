import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { Logger } from '../utils/logger.js';

/**
 * Delete command - Deletes a sound from the guild by number
 * Follows Command Pattern
 */
export class DeleteCommand {
  constructor(soundRepository) {
    this.soundRepository = soundRepository;
  }

  /**
   * Get command definition
   */
  get definition() {
    return new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Delete a sound from this guild')
      .addIntegerOption((option) =>
        option
          .setName('number')
          .setDescription('The sound number (from /sounds command)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(25)
      );
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      const soundNumber = interaction.options.getInteger('number');
      const soundIndex = soundNumber - 1; // Convert to 0-based index

      Logger.logCommand('delete', interaction, { soundNumber });

      // Fetch the sound
      const sound = await this.soundRepository.getSoundByIndex(
        interaction.guild.id,
        soundIndex
      );

      if (!sound) {
        return interaction.reply({
          content: `❌ Sound #${soundNumber} not found! Use \`/sounds\` to see available sounds.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Clean up the title for display
      let cleanTitle = sound.title
        .replace(/\s*-\s*Botón de sonido\s*/gi, '')
        .replace(/\s*-\s*Instant Sound Button\s*/gi, '')
        .replace(/\s*\|\s*Myinstants\s*/gi, '')
        .trim();

      // Create confirmation buttons
      const confirmButton = new ButtonBuilder()
        .setCustomId(`delete_confirm_${sound.id}`)
        .setLabel('Yes, Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('✅');

      const cancelButton = new ButtonBuilder()
        .setCustomId(`delete_cancel_${sound.id}`)
        .setLabel('No, Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌');

      const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

      Logger.info('Deletion confirmation requested', {
        ...Logger.getUserContext(interaction),
        soundNumber,
        soundId: sound.id,
        title: cleanTitle,
      });

      await interaction.reply({
        content: `⚠️ Are you sure you want to delete sound #${soundNumber}?\n\n**${cleanTitle}**\n\nThis action cannot be undone!`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error('Error in delete command', Logger.getUserContext(interaction), error);
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  /**
   * Handle delete confirmation button
   * @param {Object} interaction - Discord button interaction
   */
  async handleConfirmation(interaction) {
    try {
      const [action, type, soundId] = interaction.customId.split('_');

      if (type === 'cancel') {
        Logger.info('Sound deletion cancelled', {
          ...Logger.getUserContext(interaction),
          soundId,
        });

        await interaction.update({
          content: '✅ Deletion cancelled. Sound was not deleted.',
          components: [],
        });
        return;
      }

      // Confirm deletion
      if (type === 'confirm') {
        const sound = await this.soundRepository.getSoundById(
          interaction.guild.id,
          parseInt(soundId)
        );

        if (!sound) {
          return interaction.update({
            content: '❌ Sound not found! It may have already been deleted.',
            components: [],
          });
        }

        // Clean up the title for display
        let cleanTitle = sound.title
          .replace(/\s*-\s*Botón de sonido\s*/gi, '')
          .replace(/\s*-\s*Instant Sound Button\s*/gi, '')
          .replace(/\s*\|\s*Myinstants\s*/gi, '')
          .trim();

        // Delete the sound
        await this.soundRepository.deleteSound(interaction.guild.id, parseInt(soundId));

        Logger.info('Sound deleted successfully', {
          ...Logger.getUserContext(interaction),
          soundId,
          title: cleanTitle,
        });

        await interaction.update({
          content: `✅ Successfully deleted: **${cleanTitle}**`,
          components: [],
        });
      }
    } catch (error) {
      Logger.error('Error handling delete confirmation', Logger.getUserContext(interaction), error);
      await interaction.update({
        content: `❌ An error occurred: ${error.message}`,
        components: [],
      }).catch(() => {});
    }
  }
}
