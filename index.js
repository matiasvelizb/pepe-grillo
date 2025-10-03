import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { scrapeMyInstantsSound, downloadSound } from "./scraper.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Store active voice connections
const connections = new Map();

// Store sound history (last 12 sounds)
const soundHistory = [];
const MAX_SOUNDS = 12;

// Store dashboard messages for auto-updating
const dashboardMessages = new Map(); // guildId -> {channelId, messageId}

// Store disconnect timers for auto-disconnect after inactivity
const disconnectTimers = new Map(); // guildId -> timeoutId
const DISCONNECT_DELAY = 15 * 60 * 1000; // 15 minutes in milliseconds

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a sound from myinstants.com")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("The myinstants.com URL")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playing and leave the voice channel"),
  new SlashCommandBuilder()
    .setName("sounds")
    .setDescription("Show dashboard of recently downloaded sounds"),
].map((command) => command.toJSON());

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("🔄 Registering slash commands...");

    if (process.env.GUILD_ID) {
      // Register to specific guild (instant)
      console.log(`📍 Registering to guild: ${process.env.GUILD_ID}`);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(
        "✅ Guild commands registered! They should appear immediately."
      );
    } else {
      // Register globally (takes up to 1 hour)
      console.log("🌍 Registering globally (may take up to 1 hour)...");
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands,
      });
      console.log("✅ Global commands registered!");
    }
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
}

client.once("clientReady", async () => {
  console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`🎵 Ready to play sounds from myinstants.com!`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "play") {
      await handlePlayCommand(interaction);
    } else if (interaction.commandName === "stop") {
      await handleStopCommand(interaction);
    } else if (interaction.commandName === "sounds") {
      await handleSoundsCommand(interaction);
    }
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

async function handlePlayCommand(interaction) {
  try {
    const url = interaction.options.getString("url");

    // Validate it's a myinstants URL
    if (!url.includes("myinstants.com")) {
      return interaction.reply({
        content: "❌ Please provide a valid myinstants.com URL!",
        ephemeral: true,
      });
    }

    // Check if user is in a voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ You need to be in a voice channel first!",
        ephemeral: true,
      });
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak")) {
      return interaction.reply({
        content:
          "❌ I need permissions to join and speak in your voice channel!",
        ephemeral: true,
      });
    }

    // Defer reply since this might take a while
    await interaction.deferReply();

    // Scrape the sound URL
    let soundData;
    try {
      soundData = await scrapeMyInstantsSound(url);
    } catch (error) {
      return interaction.editReply(
        `❌ Failed to scrape sound: ${error.message}`
      );
    }

    await interaction.editReply(
      `🎵 Found: **${soundData.title}**\n⬇️ Downloading...`
    );

    // Download the sound
    let audioBuffer;
    try {
      audioBuffer = await downloadSound(soundData.soundUrl);
    } catch (error) {
      return interaction.editReply(
        `❌ Failed to download sound: ${error.message}`
      );
    }

    // Save to temporary file
    const tempFile = path.join(__dirname, `temp_${Date.now()}.mp3`);
    const writeStream = createWriteStream(tempFile);
    writeStream.write(audioBuffer);
    writeStream.end();

    await new Promise((resolve) => writeStream.on("finish", resolve));

    // Add to sound history
    addToSoundHistory({
      title: soundData.title,
      soundUrl: soundData.soundUrl,
      originalUrl: url,
      timestamp: Date.now(),
    });

    // Update all dashboard messages
    await updateAllDashboards();

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
      await interaction.editReply("❌ Failed to join voice channel!");
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
      // Clean up temp file and schedule disconnect after inactivity
      await unlink(tempFile).catch(() => {});
      scheduleDisconnect(interaction.guild.id);
      // Delete the status message
      await interaction.deleteReply().catch(() => {});
    });

    player.on("error", async (error) => {
      console.error("Audio player error:", error);
      await interaction.editReply("❌ Error playing audio!");
      await unlink(tempFile).catch(() => {});
      scheduleDisconnect(interaction.guild.id);
      // Delete error message after 5 seconds
      setTimeout(async () => {
        await interaction.deleteReply().catch(() => {});
      }, 5000);
    });
  } catch (error) {
    console.error("Error in play command:", error);
    const replyMethod = interaction.deferred ? "editReply" : "reply";
    await interaction[replyMethod](
      `❌ An error occurred: ${error.message}`
    ).catch(() => {});
  }
}

async function handleStopCommand(interaction) {
  const connection = connections.get(interaction.guild.id);

  if (!connection) {
    return interaction.reply({
      content: "❌ I'm not playing anything right now!",
      ephemeral: true,
    });
  }

  // Clear disconnect timer
  if (disconnectTimers.has(interaction.guild.id)) {
    clearTimeout(disconnectTimers.get(interaction.guild.id));
    disconnectTimers.delete(interaction.guild.id);
  }

  connection.connection.destroy();
  connections.delete(interaction.guild.id);
  await interaction.reply({
    content: "⏹️ Stopped playing and left the voice channel.",
    ephemeral: true,
  });
}

async function handleSoundsCommand(interaction) {
  try {
    if (soundHistory.length === 0) {
      return interaction.reply({
        content:
          "📭 No sounds have been downloaded yet! Use `/play` to add some.",
        ephemeral: true,
      });
    }

    const { embed, components } = buildDashboard();

    const message = await interaction.reply({
      embeds: [embed],
      components,
      fetchReply: true,
    });

    // Store this dashboard message for auto-updates
    dashboardMessages.set(interaction.guild.id, {
      channelId: interaction.channel.id,
      messageId: message.id,
    });
  } catch (error) {
    console.error("Error in sounds command:", error);
    await interaction.reply({
      content: "❌ Failed to show sounds dashboard!",
      ephemeral: true,
    });
  }
}

async function handleButtonInteraction(interaction) {
  try {
    // Button customId format: "sound_0", "sound_1", etc.
    const soundIndex = parseInt(interaction.customId.split("_")[1]);
    const sound = soundHistory[soundIndex];

    if (!sound) {
      return interaction.reply({
        content: "❌ This sound is no longer available!",
        ephemeral: true,
      });
    }

    // Check if user is in a voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ You need to be in a voice channel first!",
        ephemeral: true,
      });
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak")) {
      return interaction.reply({
        content:
          "❌ I need permissions to join and speak in your voice channel!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Download the sound again
    let audioBuffer;
    try {
      audioBuffer = await downloadSound(sound.soundUrl);
    } catch (error) {
      return interaction.editReply(
        `❌ Failed to download sound: ${error.message}`
      );
    }

    // Save to temporary file
    const tempFile = path.join(__dirname, `temp_${Date.now()}.mp3`);
    const writeStream = createWriteStream(tempFile);
    writeStream.write(audioBuffer);
    writeStream.end();

    await new Promise((resolve) => writeStream.on("finish", resolve));

    await interaction.editReply(`🔊 Playing: **${sound.title}**`);

    // Check if we already have an active connection
    let connectionData = connections.get(interaction.guild.id);
    let connection;
    let player;

    if (
      connectionData &&
      connectionData.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      // Reuse existing connection
      connection = connectionData.connection;
      player = connectionData.player;
      console.log("Reusing existing voice connection");
    } else {
      // Join voice channel
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      // Wait for connection to be ready
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      } catch (error) {
        connection.destroy();
        await interaction.editReply("❌ Failed to join voice channel!");
        await unlink(tempFile).catch(() => {});
        return;
      }

      // Create audio player
      player = createAudioPlayer();

      // Store connection
      connections.set(interaction.guild.id, { connection, player });
      console.log("Created new voice connection");
    }

    // Create audio resource
    const resource = createAudioResource(tempFile);

    // Play the audio
    player.play(resource);
    connection.subscribe(player);

    // Clean up temp file after playing (but keep connection alive)
    player.once(AudioPlayerStatus.Idle, async () => {
      await unlink(tempFile).catch(() => {});
      scheduleDisconnect(interaction.guild.id);
    });

    player.on("error", async (error) => {
      console.error("Audio player error:", error);
      await unlink(tempFile).catch(() => {});
      scheduleDisconnect(interaction.guild.id);
    });
  } catch (error) {
    console.error("Error in button interaction:", error);
    const replyMethod = interaction.deferred ? "editReply" : "reply";
    await interaction[replyMethod]({
      content: `❌ An error occurred: ${error.message}`,
      ephemeral: true,
    }).catch(() => {});
  }
}

function addToSoundHistory(sound) {
  // Add to beginning of array
  soundHistory.unshift(sound);

  // Keep only last 12 sounds
  if (soundHistory.length > MAX_SOUNDS) {
    soundHistory.pop();
  }

  console.log(
    `Added sound to history: ${sound.title} (${soundHistory.length}/${MAX_SOUNDS})`
  );
}

function scheduleDisconnect(guildId) {
  // Clear existing timer if any
  if (disconnectTimers.has(guildId)) {
    clearTimeout(disconnectTimers.get(guildId));
  }

  // Schedule disconnect after 15 minutes of inactivity
  const timer = setTimeout(() => {
    const connectionData = connections.get(guildId);
    if (connectionData) {
      console.log(
        `Auto-disconnecting from guild ${guildId} after ${
          DISCONNECT_DELAY / 60000
        } minutes of inactivity`
      );
      connectionData.connection.destroy();
      connections.delete(guildId);
      disconnectTimers.delete(guildId);
    }
  }, DISCONNECT_DELAY);

  disconnectTimers.set(guildId, timer);
  console.log(
    `Scheduled auto-disconnect for guild ${guildId} in ${
      DISCONNECT_DELAY / 60000
    } minutes`
  );
}

function buildDashboard() {
  const embed = new EmbedBuilder()
    .setTitle("🎵 Sound Dashboard")
    .setDescription(
      `Recently downloaded sounds (${soundHistory.length}/${MAX_SOUNDS})`
    )
    .setColor(0x5865f2)
    .setTimestamp();

  // Discord allows max 5 action rows, each with max 5 buttons
  // We'll create rows of 4 buttons each for better visual layout
  const components = [];
  const buttonsPerRow = 4;

  for (let i = 0; i < soundHistory.length; i += buttonsPerRow) {
    const row = new ActionRowBuilder();

    for (let j = i; j < Math.min(i + buttonsPerRow, soundHistory.length); j++) {
      const sound = soundHistory[j];

      // Truncate title if too long (button labels max 80 chars)
      let buttonLabel = sound.title;
      if (buttonLabel.length > 80) {
        buttonLabel = buttonLabel.substring(0, 77) + "...";
      }

      const button = new ButtonBuilder()
        .setCustomId(`sound_${j}`)
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔊");

      row.addComponents(button);
    }

    components.push(row);
  }

  return { embed, components };
}

async function updateAllDashboards() {
  if (soundHistory.length === 0 || dashboardMessages.size === 0) {
    return;
  }

  const { embed, components } = buildDashboard();

  for (const [guildId, dashboardInfo] of dashboardMessages.entries()) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(dashboardInfo.channelId);
      if (!channel) continue;

      const message = await channel.messages
        .fetch(dashboardInfo.messageId)
        .catch(() => null);
      if (!message) {
        // Message was deleted, remove from tracking
        dashboardMessages.delete(guildId);
        continue;
      }

      await message.edit({ embeds: [embed], components });
    } catch (error) {
      console.error(
        `Failed to update dashboard for guild ${guildId}:`,
        error.message
      );
      // Remove problematic dashboard
      dashboardMessages.delete(guildId);
    }
  }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
