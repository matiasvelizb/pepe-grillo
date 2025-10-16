import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { Logger } from '../../utils/logger.js';

/**
 * Delete command - Deletes a sound from the guild using unified UI
 * Follows Command Pattern
 */
export class DeleteCommand {
  constructor(soundRepository, dashboardService = null) {
    this.soundRepository = soundRepository;
    this.dashboardService = dashboardService;
  }

  /**
   * Get command definition
   */
  get definition() {
    return new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Delete a sound from this guild');
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      Logger.logCommand('delete', interaction, {});

      // Use dashboard service to display delete UI (same as sounds, but in delete mode)
      if (this.dashboardService) {
        await this.dashboardService.displayDashboard(interaction, 0, 'delete');
      } else {
        // Fallback to inline implementation
        const { UIBuilder } = await import('../utils/UIBuilder.js');
        const sounds = await this.soundRepository.getSounds(interaction.guild.id);
        const { embed, components } = UIBuilder.buildSoundsDashboard(sounds, 0, 'delete');
        
        await interaction.reply({
          embeds: [embed],
          components,
          flags: MessageFlags.Ephemeral,
        });
      }

      Logger.info('Delete UI displayed', {
        ...Logger.getUserContext(interaction),
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
   * Handle delete button/select interactions
   * @param {Object} interaction - Discord interaction
   */
  async handleDelete(interaction) {
    try {
      // Extract sound ID from customId (delete_123 or delete_sound_123)
      const customId = interaction.customId;
      let soundId;
      
      if (customId.startsWith('delete_sound_')) {
        // Button format: delete_sound_123
        soundId = parseInt(customId.split('_')[2]);
      } else if (customId.startsWith('delete_')) {
        // Select format: delete_123
        soundId = parseInt(interaction.values ? interaction.values[0].split('_')[1] : customId.split('_')[1]);
      }

      Logger.info('Sound selected for deletion', {
        ...Logger.getUserContext(interaction),
        soundId,
      });

      const sound = await this.soundRepository.getSoundById(
        interaction.guild.id,
        soundId
      );

      if (!sound) {
        return interaction.reply({
          content: '❌ Sound not found! It may have already been deleted.',
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
        soundId: sound.id,
        title: cleanTitle,
      });

      const replyMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      await interaction[replyMethod]({
        content: `⚠️ Are you sure you want to delete this sound?\n\n**${cleanTitle}**\n\nThis action cannot be undone!`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error('Error handling delete interaction', Logger.getUserContext(interaction), error);
      const replyMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      await interaction[replyMethod]({
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

        // Refresh all active dashboards for this guild
        if (this.dashboardService) {
          await this.dashboardService.refreshDashboards(interaction.guild.id);
          Logger.info('Dashboards refreshed after sound deletion', {
            ...Logger.getUserContext(interaction),
            soundId,
          });
        }
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
