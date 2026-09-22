import { MessageFlags } from 'discord.js';
import { buildSoundboard, PAGE_SIZE } from '../builders/SoundboardView.js';
import { Logger } from '../../utils/logger.js';

const MAX_TRACKED_PER_GUILD = 10;
const TRACK_TTL = 60 * 60 * 1000; // Stop refreshing dashboards after an hour

/**
 * Renders soundboards and keeps public ones up to date when sounds are added or deleted
 */
export class DashboardService {
  constructor(soundRepository, client) {
    this.soundRepository = soundRepository;
    this.client = client;
    /** @type {Map<string, Array<{channelId: string, messageId: string, sort: string, page: number, time: number}>>} */
    this.tracked = new Map();
  }

  /**
   * Build a soundboard payload for a guild
   * @returns {{payload: Object, page: number}} - page is clamped to the pages that exist
   */
  render(guildId, { mode, sort, page, notice }) {
    const result = this.soundRepository.page(guildId, sort, page, PAGE_SIZE);
    return { payload: buildSoundboard({ mode, sort, result, notice }), page: result.page };
  }

  /**
   * Reply with a public play soundboard and track it for refreshes
   */
  async show(interaction) {
    const sort = 'popular';
    const { payload } = this.render(interaction.guild.id, { mode: 'play', sort, page: 0 });
    const response = await interaction.reply({ ...payload, withResponse: true });
    this.track(interaction.guild.id, interaction.channelId, response.resource.message.id, sort, 0);
  }

  /**
   * Navigation buttons: re-render the same message at the requested page/sort
   */
  async navigate(interaction, { mode, sort, page, notice }) {
    const rendered = this.render(interaction.guild.id, { mode, sort, page, notice });
    await interaction.update(rendered.payload);

    // Delete-mode boards are ephemeral and can't be edited later, so only play boards are tracked
    if (mode === 'play') {
      this.track(interaction.guild.id, interaction.channelId, interaction.message.id, sort, rendered.page);
    }
  }

  track(guildId, channelId, messageId, sort, page) {
    const now = Date.now();
    const boards = (this.tracked.get(guildId) ?? [])
      .filter((b) => b.messageId !== messageId && now - b.time < TRACK_TTL);

    boards.push({ channelId, messageId, sort, page, time: now });
    this.tracked.set(guildId, boards.slice(-MAX_TRACKED_PER_GUILD));
  }

  /**
   * Re-render every tracked soundboard of a guild, dropping the ones that are gone or expired
   */
  async refresh(guildId) {
    const now = Date.now();
    const boards = (this.tracked.get(guildId) ?? []).filter((b) => now - b.time < TRACK_TTL);

    const alive = await Promise.all(boards.map(async (board) => {
      try {
        const channel = await this.client.channels.fetch(board.channelId);
        const { payload, page } = this.render(guildId, { mode: 'play', sort: board.sort, page: board.page });
        await channel.messages.edit(board.messageId, { components: payload.components });
        return { ...board, page };
      } catch (error) {
        // 10008 Unknown Message, 50001 Missing Access: board was deleted or is no longer visible
        if (error.code !== 10008 && error.code !== 50001) {
          Logger.error('Failed to refresh dashboard', { guildId, messageId: board.messageId }, error);
        }
        return null;
      }
    }));

    this.tracked.set(guildId, alive.filter(Boolean));
  }

  /**
   * Reply with an ephemeral delete-mode soundboard
   */
  async showDelete(interaction) {
    const { payload } = this.render(interaction.guild.id, { mode: 'delete', sort: 'recent', page: 0 });
    await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
  }
}
