import { SlashCommandBuilder, InteractionContextType } from 'discord.js';

/**
 * /sounds - post the guild soundboard
 */
export class SoundsCommand {
  constructor(dashboardService) {
    this.dashboardService = dashboardService;
  }

  static get definition() {
    return new SlashCommandBuilder()
      .setName('sounds')
      .setDescription('Show the soundboard for this server')
      .setContexts(InteractionContextType.Guild);
  }

  async execute(interaction) {
    await this.dashboardService.show(interaction);
  }
}
