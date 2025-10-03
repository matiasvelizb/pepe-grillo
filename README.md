# MyInstants Discord Bot 🎵

A Discord bot that plays sounds from [myinstants.com](https://www.myinstants.com) in voice channels. Simply provide a myinstants URL and the bot will scrape the audio file and play it!

## Features

- 🎵 Play sounds from myinstants.com
- 🔊 Join your voice channel automatically
- 🌐 Supports all myinstants.com languages (en, es, etc.)
- 🧹 Auto-cleanup after playing
- 📝 Simple command interface

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [FFmpeg](https://ffmpeg.org/) installed on your system
- A Discord Bot Token ([How to get one](https://discord.com/developers/applications))

### Installing FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**MacOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use `choco install ffmpeg`

## Setup

1. **Clone or download this project**

2. **Install dependencies:**
```bash
npm install
```

3. **Create a Discord Bot:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Go to the "Bot" section and click "Add Bot"
   - Under "Privileged Gateway Intents", enable:
     - MESSAGE CONTENT INTENT
     - SERVER MEMBERS INTENT
   - Copy your bot token

4. **Configure the bot:**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and add your Discord bot token:
     ```
     DISCORD_TOKEN=your_bot_token_here
     PREFIX=!
     ```

5. **Invite the bot to your server:**
   - In the Discord Developer Portal, go to "OAuth2" > "URL Generator"
   - Select scopes: `bot`
   - Select bot permissions:
     - Send Messages
     - Connect
     - Speak
   - Copy the generated URL and open it in your browser
   - Select your server and authorize

## Usage

Start the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Commands

- **`!play <url>`** - Play a sound from myinstants.com
  ```
  !play https://www.myinstants.com/es/instant/queri-too-87417/
  ```

- **`!stop`** or **`!leave`** - Stop playing and leave voice channel

- **`!help`** - Show help message

### Example

1. Join a voice channel in your Discord server
2. In any text channel, type:
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
