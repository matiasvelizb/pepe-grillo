# Pepe Grillo 🦗🎵

A professional Discord bot that plays sounds from [myinstants.com](https://www.myinstants.com) with guild-specific sound storage. Built with SOLID principles, clean architecture, and Docker support.

## Features

- 🎵 Play sounds from myinstants.com in voice channels
- 💾 Guild-specific sound storage (up to 20 sounds per server)
- 🎨 Interactive dashboard with buttons to play saved sounds
- 🚫 Automatic duplicate detection
- ⏰ Auto-disconnect after 15 minutes of inactivity
- 🐳 Full Docker support with PostgreSQL and Redis
- 🏗️ SOLID architecture with clean separation of concerns
- ♻️ Connection pooling and resource management

## Architecture

### Project Structure

```
pepe-grillo/
├── src/
│   ├── commands/          # Command handlers (Command Pattern)
│   │   ├── PlayCommand.js
│   │   ├── StopCommand.js
│   │   ├── SoundsCommand.js
│   │   └── ButtonHandler.js
│   ├── services/          # Business logic services
│   │   ├── ScraperService.js   # Web scraping
│   │   └── VoiceService.js     # Voice connections
│   ├── database/          # Data access layer
│   │   ├── connection.js       # DB connection pool
│   │   ├── init.js            # Schema initialization
│   │   ├── schema.sql         # PostgreSQL schema
│   │   └── SoundRepository.js # Repository pattern
│   ├── config/            # Configuration
│   │   └── config.js
│   ├── utils/             # Utilities
│   │   ├── UIBuilder.js       # UI components
│   │   └── register-commands.js
│   └── index.js           # Main entry point
├── temp/                  # Temporary audio files
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # Bot container
└── package.json

```

### Design Patterns

- **Command Pattern**: Each slash command is a separate class
- **Repository Pattern**: Database access abstracted through SoundRepository
- **Dependency Injection**: Services injected into commands
- **Single Responsibility**: Each class has one clear purpose
- **Service Layer**: Business logic separated from commands

## Prerequisites

### Option 1: Docker (Recommended)
- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Option 2: Manual Setup
- [Node.js](https://nodejs.org/) v18 or higher
- [PostgreSQL](https://www.postgresql.org/) 16+
- [Redis](https://redis.io/) 7+
- [FFmpeg](https://ffmpeg.org/)

## Quick Start with Docker 🐳

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd pepe-grillo
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Discord credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   CLIENT_ID=your_bot_client_id
   GUILD_ID=your_guild_id_optional
   DB_PASSWORD=your_secure_password
   ```

3. **Start everything with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **View logs**
   ```bash
   docker-compose logs -f bot
   ```

5. **Stop the bot**
   ```bash
   docker-compose down
   ```

That's it! The bot, PostgreSQL, and Redis will all start automatically.

## Manual Setup (Without Docker)

### 1. Install Dependencies

**FFmpeg:**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# MacOS
brew install ffmpeg

# Windows (with Chocolatey)
choco install ffmpeg
```

**PostgreSQL:**
```bash
# Ubuntu/Debian
sudo apt install postgresql

# MacOS
brew install postgresql

# Start PostgreSQL
sudo service postgresql start  # Linux
brew services start postgresql # MacOS
```

**Redis:**
```bash
# Ubuntu/Debian
sudo apt install redis-server

# MacOS
brew install redis

# Start Redis
sudo service redis-server start  # Linux
brew services start redis        # MacOS
```

### 2. Set Up Database

```bash
# Create database
psql -U postgres
CREATE DATABASE pepe_grillo;
\q
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Install Node Dependencies

```bash
npm install
```

### 5. Start the Bot

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
5. Copy your bot token (keep it secret!)
6. Go to "OAuth2" > "General"
7. Copy your Client ID
8. Go to "OAuth2" > "URL Generator"
   - Select scope: `bot`, `applications.commands`
   - Select permissions:
     - Send Messages
     - Connect
     - Speak
   - Copy the generated URL and open it to invite the bot

## Commands

### `/play <url>`
Play a sound from myinstants.com and save it to the guild.

**Example:**
```
/play https://www.myinstants.com/instant/queso-42069/
```

- ✅ Automatically downloads and plays the sound
- 💾 Saves to guild's sound library (max 20)
- 🚫 Ignores duplicates
- 🗑️ Auto-removes oldest sound when limit reached

### `/sounds`
Shows an interactive dashboard of your guild's saved sounds.

- 🎨 Beautiful embed with buttons
- 🔊 Click any button to play that sound
- 📊 Shows how many sounds are saved

### `/stop`
Stops the current playback and leaves the voice channel.

- ⏹️ Immediate stop and disconnect
- 🧹 Cleans up resources

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | - | ✅ |
| `CLIENT_ID` | Your Discord application ID | - | ✅ |
| `GUILD_ID` | Guild ID for instant command registration | - | ❌ |
| `DB_HOST` | PostgreSQL host | `localhost` | ✅ |
| `DB_PORT` | PostgreSQL port | `5432` | ❌ |
| `DB_NAME` | Database name | `pepe_grillo` | ✅ |
| `DB_USER` | Database user | `postgres` | ✅ |
| `DB_PASSWORD` | Database password | `postgres` | ✅ |
| `REDIS_HOST` | Redis host | `localhost` | ❌ |
| `REDIS_PORT` | Redis port | `6379` | ❌ |
| `NODE_ENV` | Environment (`development`/`production`) | `development` | ❌ |

## Docker Commands

```bash
# Build and start all services
docker-compose up -d

# View bot logs
docker-compose logs -f bot

# View all logs
docker-compose logs -f

# Restart the bot
docker-compose restart bot

# Stop all services
docker-compose down

# Stop and remove all data (including database)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build
```

## Development

### Project Structure Explained

- **`src/commands/`**: Each command is a class implementing the Command pattern
- **`src/services/`**: Business logic separated from commands (SRP)
- **`src/database/`**: Data access layer with Repository pattern
- **`src/config/`**: Centralized configuration
- **`src/utils/`**: Helper utilities and UI builders

### Adding a New Command

1. Create a new file in `src/commands/`:
```javascript
import { SlashCommandBuilder } from 'discord.js';

export class MyCommand {
  constructor(dependencies) {
    // Inject dependencies
  }

  get definition() {
    return new SlashCommandBuilder()
      .setName('mycommand')
      .setDescription('Description');
  }

  async execute(interaction) {
    // Command logic
  }
}
```

2. Register in `src/index.js`:
```javascript
this.myCommand = new MyCommand(dependencies);
```

3. Add to command handler in `handleCommand()` method

4. Update `src/utils/register-commands.js`

### Database Schema

The bot uses a single table for storing guild sounds:

```sql
CREATE TABLE guild_sounds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    sound_url VARCHAR(500) NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_guild_sound UNIQUE (guild_id, sound_url)
);
```

## Troubleshooting

### Bot won't start

1. Check that all environment variables are set correctly
2. Ensure PostgreSQL and Redis are running
3. Verify Discord token is valid
4. Check logs: `docker-compose logs -f bot`

### Database connection fails

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Voice connection issues

- Ensure bot has `Connect` and `Speak` permissions
- Check that you're in a voice channel
- Verify FFmpeg is installed correctly

### Commands not appearing

- Wait a few minutes if using global registration
- Use `GUILD_ID` for instant guild-specific registration
- Try re-running: `npm run register`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow SOLID principles
4. Write clean, documented code
5. Test thoroughly
6. Submit a pull request

## License

ISC

## Acknowledgments

- Built with [discord.js](https://discord.js.org/)
- Sounds from [myinstants.com](https://www.myinstants.com)
- Follows Discord.js best practices and SOLID principles

---

Made with ❤️ by the Pepe Grillo team 🦗
   ```
   !play https://www.myinstants.com/es/instant/queri-too-87417/
   ```
3. The bot will:
   - Scrape the sound from myinstants.com
   - Download the audio file
   - Join your voice channel
   - Play the sound
   - Leave after finishing

## How It Works

1. **Web Scraping:** The bot uses `axios` and `cheerio` to scrape the myinstants.com page and extract the audio file URL
2. **Audio Download:** Downloads the audio file to a temporary location
3. **Voice Connection:** Uses `@discordjs/voice` to join your voice channel
4. **Audio Playback:** Streams the audio file through FFmpeg
5. **Cleanup:** Removes temporary files and disconnects after playing

## Troubleshooting

**Bot doesn't join voice channel:**
- Make sure you're in a voice channel
- Check that the bot has "Connect" and "Speak" permissions

**Audio doesn't play:**
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check that the myinstants.com URL is valid

**"Failed to scrape sound" error:**
- The page structure might have changed
- Try a different sound URL
- Make sure the URL is from myinstants.com

**Bot is offline:**
- Check your bot token in `.env`
- Make sure you enabled MESSAGE CONTENT INTENT in Discord Developer Portal

## Project Structure

```
.
├── index.js          # Main bot file
├── scraper.js        # MyInstants scraper module
├── package.json      # Dependencies
├── .env.example      # Environment template
├── .env              # Your configuration (create this)
└── README.md         # This file
```

## Dependencies

- `discord.js` - Discord API wrapper
- `@discordjs/voice` - Voice connection handling
- `@discordjs/opus` - Audio encoding
- `axios` - HTTP requests
- `cheerio` - HTML parsing
- `ffmpeg-static` - FFmpeg binary
- `dotenv` - Environment configuration

## License

ISC

## Notes

- Only works with myinstants.com URLs
- Temporary audio files are automatically deleted after playing
- The bot will leave the voice channel after the sound finishes
- Make sure to keep your bot token secret and never commit `.env` to version control

## Contributing

Feel free to open issues or submit pull requests!
