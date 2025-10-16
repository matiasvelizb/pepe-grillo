import { UIBuilder } from '../builders/UIBuilder.js';
import { Logger } from '../../utils/logger.js';

/**
 * Service for managing sound dashboards and their state
 * Follows Single Responsibility Principle and Open/Closed Principle
 * Centralizes dashboard operations for better maintainability (SOLID)
 */
export class DashboardService {
  constructor(soundRepository, client) {
    this.soundRepository = soundRepository;
    this.client = client;
    // Store active dashboard messages per guild: { guildId: [{ channelId, messageId, page }] }
    this.activeDashboards = new Map();
  }

  /**
   * Display a sound dashboard in a channel
   * @param {Object} interaction - Discord interaction or message
   * @param {number} page - Page number to display (0-indexed)
   * @param {string} mode - 'play' or 'delete'
   */
  async displayDashboard(interaction, page = 0, mode = 'play') {
    try {
      const sounds = await this.soundRepository.getSounds(interaction.guild.id);
      const { embed, components } = UIBuilder.buildSoundsDashboard(sounds, page, mode);

      let message;
      if (interaction.replied || interaction.deferred) {
        message = await interaction.editReply({
          embeds: [embed],
          components,
        });
      } else {
        const response = await interaction.reply({
          embeds: [embed],
          components,
        });
        message = await response.fetch();
      }

      // Track this dashboard
      this.trackDashboard(interaction.guild.id, interaction.channel.id, message.id, page, mode);

      Logger.info('Dashboard displayed', {
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        messageId: message.id,
        page,
        mode,
        soundCount: sounds.length,
      });

      return message;
    } catch (error) {
      Logger.error('Failed to display dashboard', {
        guildId: interaction.guild.id,
      }, error);
      throw error;
    }
  }

  /**
   * Track an active dashboard message
   * @param {string} guildId - Guild ID
   * @param {string} channelId - Channel ID
   * @param {string} messageId - Message ID
   * @param {number} page - Current page
   * @param {string} mode - 'play' or 'delete'
   */
  trackDashboard(guildId, channelId, messageId, page = 0, mode = 'play') {
    if (!this.activeDashboards.has(guildId)) {
      this.activeDashboards.set(guildId, []);
    }

    const dashboards = this.activeDashboards.get(guildId);

    // Remove duplicates (same channel and message)
    const filtered = dashboards.filter(
      d => !(d.channelId === channelId && d.messageId === messageId)
    );

    filtered.push({ channelId, messageId, page, mode, timestamp: Date.now() });

    // Keep only last 10 dashboards per guild to prevent memory leaks
    if (filtered.length > 10) {
      filtered.shift();
    }

    this.activeDashboards.set(guildId, filtered);

    Logger.debug('Dashboard tracked', {
      guildId,
      activeDashboardCount: filtered.length,
    });
  }

  /**
   * Refresh all active dashboards for a guild
   * @param {string} guildId - Guild ID
   */
  async refreshDashboards(guildId) {
    const dashboards = this.activeDashboards.get(guildId);
    if (!dashboards || dashboards.length === 0) {
      Logger.debug('No active dashboards to refresh', { guildId });
      return;
    }

    Logger.info('Refreshing dashboards', {
      guildId,
      dashboardCount: dashboards.length,
    });

    // Fetch updated sounds
    const sounds = await this.soundRepository.getSounds(guildId);

    // Refresh each dashboard
    const refreshPromises = dashboards.map(async (dashboard) => {
      try {
        const channel = await this.client.channels.fetch(dashboard.channelId);
        if (!channel) {
          Logger.warn('Channel not found for dashboard', {
            guildId,
            channelId: dashboard.channelId,
          });
          return null;
        }

        const message = await channel.messages.fetch(dashboard.messageId);
        if (!message) {
          Logger.warn('Message not found for dashboard', {
            guildId,
            messageId: dashboard.messageId,
          });
          return null;
        }

        // Build updated dashboard with mode
        const { embed, components } = UIBuilder.buildSoundsDashboard(sounds, dashboard.page, dashboard.mode || 'play');

        // Update the message
        await message.edit({
          embeds: [embed],
          components,
        });

        Logger.debug('Dashboard refreshed', {
          guildId,
          messageId: dashboard.messageId,
          mode: dashboard.mode,
        });

        return dashboard;
      } catch (error) {
        // If message is deleted or inaccessible, log and continue
        if (error.code === 10008 || error.code === 50001) {
          Logger.debug('Dashboard message no longer accessible', {
            guildId,
            messageId: dashboard.messageId,
            error: error.message,
          });
          return null;
        }

        Logger.error('Failed to refresh dashboard', {
          guildId,
          messageId: dashboard.messageId,
        }, error);
        return null;
      }
    });

    const results = await Promise.all(refreshPromises);

    // Clean up dashboards that no longer exist
    const stillActive = results.filter(d => d !== null);
    if (stillActive.length < dashboards.length) {
      this.activeDashboards.set(guildId, stillActive);
      Logger.info('Cleaned up inactive dashboards', {
        guildId,
        removed: dashboards.length - stillActive.length,
        remaining: stillActive.length,
      });
    }
  }

  /**
   * Clear all tracked dashboards for a guild
   * @param {string} guildId - Guild ID
   */
  clearDashboards(guildId) {
    this.activeDashboards.delete(guildId);
    Logger.debug('Cleared dashboards for guild', { guildId });
  }

  /**
   * Clean up old dashboards (older than 1 hour)
   */
  cleanupOldDashboards() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let totalRemoved = 0;

    for (const [guildId, dashboards] of this.activeDashboards.entries()) {
      const stillActive = dashboards.filter(d => d.timestamp > oneHourAgo);
      const removed = dashboards.length - stillActive.length;

      if (removed > 0) {
        if (stillActive.length === 0) {
          this.activeDashboards.delete(guildId);
        } else {
          this.activeDashboards.set(guildId, stillActive);
        }
        totalRemoved += removed;
      }
    }

    if (totalRemoved > 0) {
      Logger.info('Cleaned up old dashboards', {
        removed: totalRemoved,
        activeGuilds: this.activeDashboards.size,
      });
    }
  }

  /**
   * Start periodic cleanup of old dashboards
   */
  startCleanupTask() {
    // Run cleanup every 30 minutes
    setInterval(() => {
      this.cleanupOldDashboards();
    }, 30 * 60 * 1000);

    Logger.info('Dashboard cleanup task started');
  }
}
