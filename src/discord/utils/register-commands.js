import { REST, Routes } from 'discord.js';
import { config } from '../../config/config.js';
import { Logger } from '../../utils/logger.js';

/**
 * Register slash commands: to GUILD_ID instantly if set, otherwise globally (up to 1 hour)
 * @param {Array<{definition: import('discord.js').SlashCommandBuilder}>} commandClasses
 */
export async function registerCommands(commandClasses) {
  const body = commandClasses.map((command) => command.definition.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  const { clientId, guildId } = config.discord;

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body });
  Logger.info(`Registered ${body.length} slash commands ${guildId ? `to guild ${guildId}` : 'globally'}`);
}
