import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from '@discordjs/voice';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { scrapeMyInstantsSound, downloadSound } from './scraper.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Store active voice connections
const connections = new Map();

// Define slash commands
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

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Registering slash commands...');

    if (process.env.GUILD_ID) {
      // Register to specific guild (instant)
      console.log(`📍 Registering to guild: ${process.env.GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: commands },
      );
      console.log('✅ Guild commands registered! They should appear immediately.');
    } else {
      // Register globally (takes up to 1 hour)
      console.log('🌍 Registering globally (may take up to 1 hour)...');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands },
      );
      console.log('✅ Global commands registered!');
    }
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
}

client.once('clientReady', async () => {
  console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`🎵 Ready to play sounds from myinstants.com!`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'play') {
    await handlePlayCommand(interaction);
  } else if (interaction.commandName === 'stop') {
    await handleStopCommand(interaction);
  }
});

async function handlePlayCommand(interaction) {
  try {
    const url = interaction.options.getString('url');

    // Validate it's a myinstants URL
    if (!url.includes('myinstants.com')) {
      return interaction.reply({ content: '❌ Please provide a valid myinstants.com URL!', ephemeral: true });
    }

    // Check if user is in a voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '❌ You need to be in a voice channel first!', ephemeral: true });
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.reply({ content: '❌ I need permissions to join and speak in your voice channel!', ephemeral: true });
    }

    // Defer reply since this might take a while
    await interaction.deferReply();

    // Scrape the sound URL
    let soundData;
    try {
      soundData = await scrapeMyInstantsSound(url);
    } catch (error) {
      return interaction.editReply(`❌ Failed to scrape sound: ${error.message}`);
    }

    await interaction.editReply(`🎵 Found: **${soundData.title}**\n⬇️ Downloading...`);

    // Download the sound
    let audioBuffer;
    try {
      audioBuffer = await downloadSound(soundData.soundUrl);
    } catch (error) {
      return interaction.editReply(`❌ Failed to download sound: ${error.message}`);
    }

    // Save to temporary file
    const tempFile = path.join(__dirname, `temp_${Date.now()}.mp3`);
    const writeStream = createWriteStream(tempFile);
    writeStream.write(audioBuffer);
    writeStream.end();

    await new Promise((resolve) => writeStream.on('finish', resolve));

    await interaction.editReply(`🔊 Playing: **${soundData.title}**`);

    // Join voice channel
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    // Wait for connection to be ready
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      connection.destroy();
      await interaction.editReply('❌ Failed to join voice channel!');
      await unlink(tempFile).catch(() => {});
      return;
    }

    // Create audio player
    const player = createAudioPlayer();
    const resource = createAudioResource(tempFile);

    // Store connection
    connections.set(interaction.guild.id, { connection, player });

    // Play the audio
    player.play(resource);
    connection.subscribe(player);

    // Handle player events
    player.on(AudioPlayerStatus.Idle, async () => {
      // Clean up after playing
      setTimeout(async () => {
        connection.destroy();
        connections.delete(interaction.guild.id);
        await unlink(tempFile).catch(() => {});
        // Delete the status message
        await interaction.deleteReply().catch(() => {});
      }, 1000);
    });

    player.on('error', async (error) => {
      console.error('Audio player error:', error);
      await interaction.editReply('❌ Error playing audio!');
      connection.destroy();
      connections.delete(interaction.guild.id);
      await unlink(tempFile).catch(() => {});
      // Delete error message after 5 seconds
      setTimeout(async () => {
        await interaction.deleteReply().catch(() => {});
      }, 5000);
    });

  } catch (error) {
    console.error('Error in play command:', error);
    const replyMethod = interaction.deferred ? 'editReply' : 'reply';
    await interaction[replyMethod](`❌ An error occurred: ${error.message}`).catch(() => {});
  }
}

async function handleStopCommand(interaction) {
  const connection = connections.get(interaction.guild.id);

  if (!connection) {
    return interaction.reply({ content: '❌ I\'m not playing anything right now!', ephemeral: true });
  }

  connection.connection.destroy();
  connections.delete(interaction.guild.id);
  await interaction.reply({ content: '⏹️ Stopped playing and left the voice channel.', ephemeral: true });
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
