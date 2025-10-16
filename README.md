# Pepe Grillo

Discord bot that scrapes sounds from [myinstants.com](https://myinstants.com) and plays them in voice channels.

![Dashboard Example](/docs/example.png)

## What It Does

- Scrapes and plays sounds from myinstants.com
- Stores up to 100 sounds per server in PostgreSQL
- Caches audio files in Redis for fast repeated playback
- Interactive dashboards with pagination (buttons or select menus)
- Auto-refreshes dashboards when sounds are added or deleted
- Auto-disconnects after 15 minutes of inactivity

## How It Works

1. User runs `/play <url>` with a myinstants.com URL
2. Bot scrapes the audio file URL from the page
3. Downloads audio and saves metadata to database
4. Plays audio in voice channel
5. Caches audio in Redis (subsequent plays are instant)

Dashboard interactions check Redis cache first. On cache hit, playback is immediate. On cache miss, audio is downloaded, played, then cached for next time.

## Setup

Clone and configure:
```bash
git clone https://github.com/matiasvelizb/pepe-grillo.git
cd pepe-grillo
cp .env.example .env
```

Edit `.env` with your Discord bot credentials.

Start with Docker:
```bash
docker compose up -d --build
```

Check logs:
```bash
docker compose logs -f bot
```

Stop:
```bash
docker compose down
```

## Configuration

The `.env` file contains all configuration:

```bash
# Discord Bot Settings
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here # optional, for quick command registration

# Database Settings
POSTGRES_USER=pepegrillo
POSTGRES_PASSWORD=pepegrillo123
POSTGRES_DB=pepegrillodb
DB_HOST=db
DB_PORT=5432

# Redis Cache Settings
REDIS_HOST=redis
REDIS_PORT=6379

# UI Type (BUTTONS or SELECT)
UI_TYPE=BUTTONS

# Node Environment
NODE_ENV=production
```

**UI_TYPE Options:**
- `BUTTONS` - Grid layout with 20 sounds per page (default)
- `SELECT` - Dropdown menus with 25 sounds per page

## Commands

- `/play <url>` - Play and save a sound from myinstants.com
- `/sounds` - Browse saved sounds with pagination
- `/delete` - Remove sounds from the server
- `/stop` - Stop playback and disconnect
