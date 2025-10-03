import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Logger } from '../utils/logger.js';

/**
 * Play command - Plays a sound from MyInstants and saves it to the guild
 * Follows Command Pattern - encapsulates all logic for this command
 */
export class PlayCommand {
  constructor(scraperService, voiceService, soundRepository) {
    this.scraperService = scraperService;
    this.voiceService = voiceService;
    this.soundRepository = soundRepository;
  }

  /**
   * Get command definition
   */
  get definition() {
    return new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a sound from myinstants.com')
      .addStringOption((option) =>
        option
          .setName('url')
          .setDescription('The myinstants.com URL')
          .setRequired(true)
      );
  }

  /**
   * Execute the command
   * @param {Object} interaction - Discord interaction
   */
  async execute(interaction) {
    try {
      const url = interaction.options.getString('url');

      Logger.logCommand('play', interaction, { url });

      // Validate it's a myinstants URL
      if (!url.includes('myinstants.com')) {
        return interaction.reply({
          content: '❌ Please provide a valid myinstants.com URL!',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check if user is in a voice channel
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: '❌ You need to be in a voice channel first!',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Check bot permissions
      const permissions = voiceChannel.permissionsFor(interaction.client.user);
      if (!permissions.has('Connect') || !permissions.has('Speak')) {
        return interaction.reply({
          content:
            '❌ I need permissions to join and speak in your voice channel!',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Defer reply since this might take a while
      await interaction.deferReply();

      Logger.info('Scraping sound from MyInstants', {
        ...Logger.getUserContext(interaction),
        url,
      });

      // Scrape the sound URL
      let soundData;
      try {
        soundData = await this.scraperService.scrapeMyInstantsSound(url);
        Logger.info('Successfully scraped sound', {
          ...Logger.getUserContext(interaction),
          title: soundData.title,
          soundUrl: soundData.soundUrl,
        });
      } catch (error) {
        Logger.error('Failed to scrape sound', Logger.getUserContext(interaction), error);
        return interaction.editReply(
          `❌ Failed to scrape sound: ${error.message}`
        );
      }

      // Check for duplicates
      const isDuplicate = await this.soundRepository.isDuplicate(
        interaction.guild.id,
        soundData.soundUrl
      );

      if (isDuplicate) {
        Logger.info('Sound already exists, playing anyway', {
          ...Logger.getUserContext(interaction),
          title: soundData.title,
        });
        await interaction.editReply({
          content: `⚠️ **${soundData.title}** is already in this guild's sounds! Playing anyway...`,
        });
      } else {
        await interaction.editReply({
          content: `🎵 Found: **${soundData.title}**\n⬇️ Downloading...`,
        });
      }

      // Download the sound
      let audioBuffer;
      try {
        audioBuffer = await this.scraperService.downloadSound(soundData.soundUrl);
        Logger.info('Successfully downloaded sound', {
          ...Logger.getUserContext(interaction),
          title: soundData.title,
          bufferSize: audioBuffer.length,
        });
      } catch (error) {
        Logger.error('Failed to download sound', Logger.getUserContext(interaction), error);
        return interaction.editReply(
          `❌ Failed to download sound: ${error.message}`
        );
      }

      // Save to database (only if not duplicate)
      if (!isDuplicate) {
        try {
          await this.soundRepository.addSound(interaction.guild.id, {
            soundUrl: soundData.soundUrl,
            title: soundData.title,
            originalUrl: url,
          });
        } catch (error) {
          Logger.error('Failed to save sound to database', Logger.getUserContext(interaction), error);
          // Continue anyway, don't fail the command
        }
      }

      await interaction.editReply({
        content: `🔊 Playing: **${soundData.title}**`,
      });

      // Play the audio
      try {
        await this.voiceService.playAudio(
          voiceChannel,
          interaction.guild.id,
          interaction.guild.voiceAdapterCreator,
          audioBuffer,
          soundData.title
        );

        // Delete the status message after playing starts
        setTimeout(async () => {
          await interaction.deleteReply().catch(() => {});
        }, 2000); // Reduced to 2 seconds for cleaner UX
      } catch (error) {
        Logger.error('Failed to play audio', Logger.getUserContext(interaction), error);

        let errorMessage = `❌ Failed to play audio: ${error.message}`;

        // Add helpful hints for common errors
        if (error.message.includes('encryption')) {
          errorMessage += '\n\n💡 **Encryption Error**: The bot is missing required audio encryption libraries (sodium/libsodium-wrappers/tweetnacl).';
        } else if (error.message.includes('permission')) {
          errorMessage += '\n\n💡 Make sure I have **Connect** and **Speak** permissions in your voice channel.';
        } else if (error.message.includes('EACCES')) {
          errorMessage += '\n\n💡 **Permission Error**: The bot cannot write temporary files.';
        }

        return interaction.editReply(errorMessage);
      }
    } catch (error) {
      Logger.error('Error in play command', Logger.getUserContext(interaction), error);
      const replyMethod = interaction.deferred ? 'editReply' : 'reply';
      await interaction[replyMethod](
        `❌ An error occurred: ${error.message}`
      ).catch(() => {});
    }
  }
}
