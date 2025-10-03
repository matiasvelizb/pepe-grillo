import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config/config.js';
import { db } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { SoundRepository } from './database/SoundRepository.js';
import { ScraperService } from './services/ScraperService.js';
import { VoiceService } from './services/VoiceService.js';
import { PlayCommand } from './commands/PlayCommand.js';
import { StopCommand } from './commands/StopCommand.js';
import { SoundsCommand } from './commands/SoundsCommand.js';
import { ButtonHandler } from './commands/ButtonHandler.js';
import { registerCommands } from './utils/register-commands.js';

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

    // Initialize command handlers
    this.playCommand = new PlayCommand(
      this.scraperService,
      this.voiceService,
      this.soundRepository
    );
    this.stopCommand = new StopCommand(this.voiceService);
    this.soundsCommand = new SoundsCommand(this.soundRepository);
    this.buttonHandler = new ButtonHandler(
      this.soundRepository,
      this.scraperService,
      this.voiceService
    );

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Set up Discord event listeners
   */
  setupEventListeners() {
    this.client.once('ready', async () => {
      console.log(`🤖 Bot is ready! Logged in as ${this.client.user.tag}`);
      console.log(`🎵 Ready to play sounds from myinstants.com!`);

      // Register slash commands
      await registerCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.buttonHandler.handle(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
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
      default:
        console.warn(`Unknown command: ${interaction.commandName}`);
    }
  }

  /**
   * Initialize database connection and schema
   */
  async initializeDatabase() {
    try {
      await db.connect();
      await initializeDatabase();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
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
      console.log('🔐 Logging in to Discord...');
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Gracefully shutdown the bot
   */
  async shutdown() {
    console.log('\n🛑 Shutting down bot...');

    try {
      // Disconnect from all voice channels
      for (const [guildId] of this.voiceService.connections) {
        this.voiceService.disconnect(guildId);
      }

      // Disconnect from database
      await db.disconnect();

      // Destroy Discord client
      this.client.destroy();

      console.log('👋 Bot shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the bot
const bot = new Bot();
bot.start();
