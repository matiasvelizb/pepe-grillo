# Pepe Grillo - A MyInstants Discord Bot


Just a Discord bot that scrapes [myinstants.com](https://myinstants.com) and plays sounds in your server's voice channels.

![Guild Sound Dashboard](docs/dashboard-example.png)

## Features

- Play sounds from myinstants.com in voice channels
- Save up to 25 sounds per server
- Shows a dashboard with your saved sounds
- Delete saved sounds with a command or automatically the oldest when limit is reached
- Ignores duplicates
- Auto-disconnects after 15 minutes of inactivity
- Docker only (PostgreSQL + Redis included)

## Setup (Docker Only)

1. Clone this repo
   ```bash
   git clone https://github.com/matiasvelizb/pepe-grillo.git
   cd pepe-grillo
   ```
2. Copy the env file and edit it
   ```bash
   cp .env.example .env
   # Edit .env with your Discord token and client ID
   ```
3. Build and run everything
   ```bash
   docker-compose up -d --build
   ```
4. Check logs if you want
   ```bash
   docker-compose logs -f bot
   ```

5. That's it. If you want to stop it:
   ```bash
   docker-compose down
   ```

> [!IMPORTANT]
> Discord now requires the bot to support the new AEAD voice encryption modes. The bundled Docker image runs on Node.js 22.12 and pre-installs `libsodium-wrappers` so you're ready to go after rebuilding the containers.

## Commands

- `/play <url>` — Play and save a sound from myinstants.com
- `/sounds` — Show your saved sounds
- `/delete <id>` — Delete a saved sound by its ID (from `/sounds` list)
- `/stop` — Stop playback and leave voice channel

## How It Works

1. Scrapes myinstants.com for the audio file
2. Downloads the audio to a temp folder
3. Joins your voice channel and plays it with FFmpeg
4. Cleans up and leaves after playing
5. Saves the sound to the database if not a duplicate

## Troubleshooting

- Bot doesn't join voice: Make sure you're in a voice channel and the bot has permissions
- Audio doesn't play: Check FFmpeg is installed in the container, and the URL is valid
- "Failed to scrape sound": myinstants.com changed, or bad URL
- Bot is offline: Check your token in `.env` and that the container is running
- "No compatible encryption modes": Rebuild the containers (`docker-compose up -d --build`) so they pick up the Node.js 22.12 base image and updated dependencies, or ensure your custom runtime includes Node.js ≥ 22.12 with either native AES-GCM support or one of the supported sodium libraries.
