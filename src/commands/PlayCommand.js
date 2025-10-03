import { SlashCommandBuilder } from 'discord.js';

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

      // Validate it's a myinstants URL
      if (!url.includes('myinstants.com')) {
        return interaction.reply({
          content: '❌ Please provide a valid myinstants.com URL!',
          ephemeral: true,
        });
      }

      // Check if user is in a voice channel
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: '❌ You need to be in a voice channel first!',
          ephemeral: true,
        });
      }

      // Check bot permissions
      const permissions = voiceChannel.permissionsFor(interaction.client.user);
      if (!permissions.has('Connect') || !permissions.has('Speak')) {
        return interaction.reply({
          content:
            '❌ I need permissions to join and speak in your voice channel!',
          ephemeral: true,
        });
      }

      // Defer reply since this might take a while
      await interaction.deferReply();

      // Scrape the sound URL
      let soundData;
      try {
        soundData = await this.scraperService.scrapeMyInstantsSound(url);
      } catch (error) {
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
        await interaction.editReply(
          `⚠️ **${soundData.title}** is already in this guild's sounds! Playing anyway...`
        );
      } else {
        await interaction.editReply(
          `🎵 Found: **${soundData.title}**\n⬇️ Downloading...`
        );
      }

      // Download the sound
      let audioBuffer;
      try {
        audioBuffer = await this.scraperService.downloadSound(soundData.soundUrl);
      } catch (error) {
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
          console.log(`💾 Saved sound to database: ${soundData.title}`);
        } catch (error) {
          console.error('Failed to save sound to database:', error.message);
          // Continue anyway, don't fail the command
        }
      }

      await interaction.editReply(`🔊 Playing: **${soundData.title}**`);

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
        }, 3000);
      } catch (error) {
        console.error('❌ PlayCommand - Failed to play audio:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });

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
      console.error('Error in play command:', error);
      const replyMethod = interaction.deferred ? 'editReply' : 'reply';
      await interaction[replyMethod](
        `❌ An error occurred: ${error.message}`
      ).catch(() => {});
    }
  }
}
