-- Create guild_sounds table
CREATE TABLE IF NOT EXISTS guild_sounds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    sound_url VARCHAR(500) NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Index for faster queries by guild
    CONSTRAINT unique_guild_sound UNIQUE (guild_id, sound_url)
);

-- Create index on guild_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_sounds_guild_id ON guild_sounds(guild_id);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_guild_sounds_created_at ON guild_sounds(guild_id, created_at DESC);
