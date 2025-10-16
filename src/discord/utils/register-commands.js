import { REST, Routes } from 'discord.js';
import { config } from '../../config/config.js';
import { PlayCommand } from '../commands/PlayCommand.js';
import { StopCommand } from '../commands/StopCommand.js';
import { SoundsCommand } from '../commands/SoundsCommand.js';
import { DeleteCommand } from '../commands/DeleteCommand.js';

/**
 * Utility to register slash commands with Discord
 */
async function registerCommands() {
  // Create dummy instances just to get command definitions
  const playCommand = new PlayCommand(null, null, null);
  const stopCommand = new StopCommand(null);
  const soundsCommand = new SoundsCommand(null);
  const deleteCommand = new DeleteCommand(null);

  const commands = [
    playCommand.definition.toJSON(),
    stopCommand.definition.toJSON(),
    soundsCommand.definition.toJSON(),
    deleteCommand.definition.toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  try {
    console.log('🔄 Registering slash commands...');

    if (config.discord.guildId) {
      // Register to specific guild (instant)
      console.log(`📍 Registering to guild: ${config.discord.guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(
          config.discord.clientId,
          config.discord.guildId
        ),
        { body: commands }
      );
      console.log('✅ Guild commands registered! They should appear immediately.');
    } else {
      // Register globally (takes up to 1 hour)
      console.log('🌍 Registering globally (may take up to 1 hour)...');
      await rest.put(Routes.applicationCommands(config.discord.clientId), {
        body: commands,
      });
      console.log('✅ Global commands registered!');
    }
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  registerCommands()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { registerCommands };
