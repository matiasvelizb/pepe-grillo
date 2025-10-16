import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Discord Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'pepe_grillo',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },

  // Bot Configuration
  bot: {
    maxSoundsPerGuild: 100, // Maximum sounds per guild
    autoDisconnectDelay: 15 * 60 * 1000, // 15 minutes
    uiType: (process.env.UI_TYPE || 'BUTTONS').toUpperCase(), // 'BUTTONS' or 'SELECT'
  },
};
