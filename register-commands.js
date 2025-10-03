import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a sound from myinstants.com')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The myinstants.com URL')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing and leave the voice channel'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Get guild ID from command line argument
const guildId = process.argv[2];

(async () => {
  try {
    console.log('🔄 Registering slash commands...');

    if (guildId) {
      // Register to specific guild (instant)
      console.log(`📍 Registering to guild: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      );
      console.log('✅ Guild commands registered! They should appear immediately.');
    } else {
      // Register globally (takes up to 1 hour)
      console.log('🌍 Registering globally...');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('✅ Global commands registered! May take up to 1 hour to appear.');
    }
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
