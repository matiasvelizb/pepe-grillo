/**
 * Professional logging utility with timestamps and context
 * Provides consistent logging format across the application
 */
export class Logger {
  /**
   * Format a log message with timestamp and context
   * @param {string} level - Log level (INFO, ERROR, WARN, DEBUG)
   * @param {string} message - Log message
   * @param {Object} context - Additional context (guildId, userId, username, etc.)
   * @returns {string} - Formatted log message
   */
  static format(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const parts = [`[${timestamp}]`, `[${level}]`];

    if (context.guildId) {
      parts.push(`[Guild: ${context.guildId}]`);
    }

    if (context.userId) {
      parts.push(`[User: ${context.username || 'Unknown'}#${context.userId}]`);
    }

    if (context.action) {
      parts.push(`[Action: ${context.action}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static info(message, context = {}) {
    console.log(this.format('INFO', message, context));
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   * @param {Error} error - Error object (optional)
   */
  static error(message, context = {}, error = null) {
    console.error(this.format('ERROR', message, context));
    if (error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static warn(message, context = {}) {
    console.warn(this.format('WARN', message, context));
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  static debug(message, context = {}) {
    console.log(this.format('DEBUG', message, context));
  }

  /**
   * Extract user context from Discord interaction
   * @param {Object} interaction - Discord interaction
   * @returns {Object} - User context object
   */
  static getUserContext(interaction) {
    return {
      guildId: interaction.guild?.id,
      guildName: interaction.guild?.name,
      userId: interaction.user?.id,
      username: interaction.user?.username,
      discriminator: interaction.user?.discriminator,
    };
  }

  /**
   * Log command execution
   * @param {string} commandName - Name of the command
   * @param {Object} interaction - Discord interaction
   * @param {Object} additionalContext - Additional context
   */
  static logCommand(commandName, interaction, additionalContext = {}) {
    const context = {
      ...this.getUserContext(interaction),
      action: commandName,
      ...additionalContext,
    };
    this.info(`Command executed: ${commandName}`, context);
  }

  /**
   * Log database operation
   * @param {string} operation - Database operation name
   * @param {string} guildId - Guild ID
   * @param {Object} additionalContext - Additional context
   */
  static logDatabase(operation, guildId, additionalContext = {}) {
    const context = {
      guildId,
      action: 'Database',
      ...additionalContext,
    };
    this.info(`${operation}`, context);
  }

  /**
   * Log voice service operation
   * @param {string} operation - Voice operation name
   * @param {string} guildId - Guild ID
   * @param {Object} additionalContext - Additional context
   */
  static logVoice(operation, guildId, additionalContext = {}) {
    const context = {
      guildId,
      action: 'Voice',
      ...additionalContext,
    };
    this.info(`${operation}`, context);
  }
}
