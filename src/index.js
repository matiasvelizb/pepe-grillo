import { Client, GatewayIntentBits } from 'discord.js';
import sodium from 'libsodium-wrappers';
import { config } from './config/config.js';
import { db } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { SoundRepository } from './database/SoundRepository.js';
import { ScraperService } from './myinstants/ScraperService.js';
import { VoiceService } from './discord/services/VoiceService.js';
import { DashboardService } from './discord/services/DashboardService.js';
import { AudioService } from './discord/services/AudioService.js';
import { PlayCommand } from './discord/commands/PlayCommand.js';
import { StopCommand } from './discord/commands/StopCommand.js';
import { SoundsCommand } from './discord/commands/SoundsCommand.js';
import { DeleteCommand } from './discord/commands/DeleteCommand.js';
import { PaginationHandler } from './discord/handlers/PaginationHandler.js';
import { SelectMenuHandler } from './discord/handlers/SelectMenuHandler.js';
import { registerCommands } from './discord/utils/register-commands.js';
import { Logger } from './utils/logger.js';

await (async () => {
  try {
    await sodium.ready;
    Logger.debug('Initialized libsodium for voice encryption support');
  } catch (error) {
    Logger.error('Failed to initialize libsodium', {}, error);
    process.exit(1);
  }
})();

/**
 * Main Bot Class
 * Follows Dependency Injection and Single Responsibility principles
 */
class Bot {
  constructor() {
    // Initialize Discord client
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });

    // Initialize services (Dependency Injection)
    this.soundRepository = new SoundRepository();
    this.scraperService = new ScraperService();
    this.voiceService = new VoiceService();
    this.dashboardService = new DashboardService(this.soundRepository, this.client);
    this.audioService = new AudioService(this.scraperService, this.voiceService);

    // Initialize command handlers
    this.playCommand = new PlayCommand(
      this.scraperService,
      this.voiceService,
      this.soundRepository,
      this.dashboardService
    );
    this.stopCommand = new StopCommand(this.voiceService);
    this.soundsCommand = new SoundsCommand(this.soundRepository, this.dashboardService);
    this.deleteCommand = new DeleteCommand(this.soundRepository, this.dashboardService);

    // Initialize interaction handlers
    this.paginationHandler = new PaginationHandler(this.soundRepository);
    this.selectMenuHandler = new SelectMenuHandler(this.soundRepository, this.audioService);

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Set up Discord event listeners
   */
  setupEventListeners() {
    this.client.once('clientReady', async () => {
      Logger.info('Bot is ready', {
        botTag: this.client.user.tag,
        botId: this.client.user.id,
        guildCount: this.client.guilds.cache.size,
      });

      // Register slash commands
      await registerCommands();

      // Start dashboard cleanup task
      this.dashboardService.startCleanupTask();
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          // Handle delete confirmation buttons (delete_confirm_X or delete_cancel_X)
          if (interaction.customId.startsWith('delete_confirm_') ||
              interaction.customId.startsWith('delete_cancel_')) {
            await this.deleteCommand.handleConfirmation(interaction);
          }
          // Handle delete sound button in BUTTONS mode (delete_sound_X)
          else if (interaction.customId.startsWith('delete_sound_')) {
            await this.deleteCommand.handleDelete(interaction);
          }
          // Handle play sound button in BUTTONS mode (play_sound_X)
          else if (interaction.customId.startsWith('play_sound_')) {
            // Extract sound ID and play directly
            const soundId = parseInt(interaction.customId.split('_')[2]);
            await this.audioService.playSound(interaction, soundId);
          }
          // Handle pagination buttons
          else if (interaction.customId.startsWith('page_')) {
            await this.paginationHandler.handle(interaction);
          }
        } else if (interaction.isStringSelectMenu()) {
          // Handle sound selection from select menus (sound_select_page_X)
          if (interaction.customId.startsWith('sound_select_')) {
            await this.selectMenuHandler.handle(interaction);
          }
          // Handle delete sound selection from select menu (delete_select_page_X)
          else if (interaction.customId.startsWith('delete_select_')) {
            await this.deleteCommand.handleDelete(interaction);
          }
        }
      } catch (error) {
        Logger.error('Error handling interaction', {
          guildId: interaction.guild?.id,
          userId: interaction.user?.id,
          type: interaction.type,
        }, error);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Handle slash commands
   */
  async handleCommand(interaction) {
    switch (interaction.commandName) {
      case 'play':
        await this.playCommand.execute(interaction);
        break;
      case 'stop':
        await this.stopCommand.execute(interaction);
        break;
      case 'sounds':
        await this.soundsCommand.execute(interaction);
        break;
      case 'delete':
        await this.deleteCommand.execute(interaction);
        break;
      default:
        Logger.warn('Unknown command received', {
          ...Logger.getUserContext(interaction),
          commandName: interaction.commandName,
        });
    }
  }

  /**
   * Initialize database connection and schema
   */
  async initializeDatabase() {
    try {
      await db.connect();
      await initializeDatabase();
      Logger.info('Database initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize database', {}, error);
      throw error;
    }
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      // Initialize database first
      await this.initializeDatabase();

      // Login to Discord
      Logger.info('Logging in to Discord...');
      await this.client.login(config.discord.token);
    } catch (error) {
      Logger.error('Failed to start bot', {}, error);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Gracefully shutdown the bot
   */
  async shutdown() {
    Logger.info('Shutting down bot...');

    try {
      // Disconnect from all voice channels
      for (const [guildId] of this.voiceService.connections) {
        this.voiceService.disconnect(guildId);
      }

      // Disconnect from database
      await db.disconnect();

      // Destroy Discord client
      this.client.destroy();

      Logger.info('Bot shut down successfully');
      process.exit(0);
    } catch (error) {
      Logger.error('Error during shutdown', {}, error);
      process.exit(1);
    }
  }
}

// Create and start the bot
const bot = new Bot();
bot.start();
