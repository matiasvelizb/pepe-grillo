import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildId = process.argv[2];

(async () => {
  try {
    if (guildId) {
      console.log(`🗑️  Deleting guild commands for guild: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: [] },
      );
      console.log('✅ Guild commands deleted!');
    }

    console.log('🗑️  Deleting global commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [] },
    );
    console.log('✅ Global commands deleted!');

    console.log('\n✨ All commands cleared! Restart your bot to register them again.');
  } catch (error) {
    console.error('❌ Error deleting commands:', error);
  }
})();
