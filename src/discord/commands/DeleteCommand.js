import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { Logger } from '../../utils/logger.js';
import { buildDeleteConfirm, cleanTitle } from '../builders/SoundboardView.js';

/**
 * /delete - ephemeral delete-mode soundboard. Picking a sound asks for confirmation
 * in the same message, then returns to the board at the same page.
 */
export class DeleteCommand {
  constructor(soundRepository, audioService, dashboardService) {
    this.soundRepository = soundRepository;
    this.audioService = audioService;
    this.dashboardService = dashboardService;
  }

  static get definition() {
    return new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Delete sounds from this server')
      .setContexts(InteractionContextType.Guild);
  }

  async execute(interaction) {
    await this.dashboardService.showDelete(interaction);
  }

  /**
   * A sound button on the delete board: show the confirmation step
   */
  async select(interaction, soundId, sort, page) {
    const sound = this.soundRepository.getById(interaction.guild.id, soundId);
    if (!sound) {
      return this.backToBoard(interaction, sort, page, '❌ That sound was already deleted.');
    }
    await interaction.update(buildDeleteConfirm(sound, sort, page));
  }

  async confirm(interaction, soundId, sort, page) {
    const sound = this.soundRepository.getById(interaction.guild.id, soundId);
    if (!sound || !this.soundRepository.delete(interaction.guild.id, soundId)) {
      Logger.activity('DELETE', 'ERROR', interaction, { reason: 'Sound not found' });
      return this.backToBoard(interaction, sort, page, '❌ That sound was already deleted.');
    }

    const title = cleanTitle(sound.title);
    Logger.activity('DELETE', 'OK', interaction, { sound: title });
    await this.audioService.releaseAudio(sound.sound_url);

    await this.backToBoard(interaction, sort, page, `✅ Deleted **${title}**`);
    await this.dashboardService.refresh(interaction.guild.id);
  }

  async cancel(interaction, sort, page) {
    await this.backToBoard(interaction, sort, page);
  }

  backToBoard(interaction, sort, page, notice) {
    return this.dashboardService.navigate(interaction, { mode: 'delete', sort, page, notice });
  }
}
