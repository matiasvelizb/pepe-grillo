import * as cheerio from 'cheerio';
import { FlareSolverrClient } from './FlareSolverrClient.js';
import { HttpClient } from './HttpClient.js';
import { Logger } from '../utils/logger.js';

/**
 * Service for scraping sounds from MyInstants
 * Follows Single Responsibility Principle - only handles web scraping
 */
export class ScraperService {
  /**
   * @param {HttpClient} [httpClient] - Chrome-impersonating HTTP client
   * @param {FlareSolverrClient} [flareSolverr] - Challenge solver, used as fallback
   */
  constructor(httpClient = new HttpClient(), flareSolverr = new FlareSolverrClient()) {
    this.http = httpClient;
    this.flareSolverr = flareSolverr;
  }

  /**
   * Cookies obtained by FlareSolverr, if it has solved a challenge this run
   * @returns {object} - Headers to merge into a request
   */
  buildHeaders() {
    const cookieHeader = this.flareSolverr.getCookieHeader();
    return cookieHeader ? { Cookie: cookieHeader } : {};
  }

  /**
   * Fetches a page's HTML, falling back to FlareSolverr when Cloudflare
   * escalates to a JavaScript challenge that the HTTP client cannot solve
   * @param {string} url - The page URL
   * @returns {Promise<string>} - The page HTML
   */
  async fetchPage(url) {
    try {
      return await this.http.getText(url, this.buildHeaders());
    } catch (error) {
      if (
        !HttpClient.isCloudflareBlock(error.status) ||
        !this.flareSolverr.isEnabled()
      ) {
        throw error;
      }

      Logger.info('Request blocked, retrying through FlareSolverr', {
        url,
        status: error.status,
      });

      const solution = await this.flareSolverr.get(url);
      return solution.html;
    }
  }

  /**
   * Scrapes a MyInstants sound URL and extracts the audio file URL
   * @param {string} url - The MyInstants page URL
   * @returns {Promise<{soundUrl: string, title: string}>}
   */
  async scrapeMyInstantsSound(url) {
    try {
      // Validate URL is from myinstants.com
      if (!url.includes('myinstants.com')) {
        throw new Error('URL must be from myinstants.com');
      }

      // Fetch the page
      const html = await this.fetchPage(url);

      // Parse HTML with cheerio
      const $ = cheerio.load(html);

      let soundUrl = null;

      // Method 1: Look for the download button (most reliable)
      const downloadButton = $('a[download][href*="/media/sounds/"]');
      if (downloadButton.length > 0) {
        soundUrl = downloadButton.attr('href');
        Logger.debug('Found sound URL from download button', { soundUrl });
      }

      // Method 2: Find the play button with onclick attribute
      if (!soundUrl) {
        const soundButton = $('.small-button, .large-button').first();
        const onclickAttr = soundButton.attr('onclick');

        if (onclickAttr) {
          const match = onclickAttr.match(/play\('([^']+)'/);
          if (match && match[1]) {
            soundUrl = match[1];
            Logger.debug('Found sound URL from onclick', { soundUrl });
          }
        }
      }

      // Method 3: Try data-url attribute
      if (!soundUrl) {
        const soundButton = $('.small-button, .large-button').first();
        soundUrl = soundButton.attr('data-url');
        if (soundUrl) {
          Logger.debug('Found sound URL from data-url', { soundUrl });
        }
      }

      // Method 4: Look for audio source tag
      if (!soundUrl) {
        const audioSource = $('source').attr('src');
        if (audioSource) {
          soundUrl = audioSource;
          Logger.debug('Found sound URL from audio source', { soundUrl });
        }
      }

      // Method 5: Fall back to the Open Graph audio metadata
      if (!soundUrl) {
        soundUrl = $('meta[property="og:audio"]').attr('content');
        if (soundUrl) {
          Logger.debug('Found sound URL from og:audio', { soundUrl });
        }
      }

      if (!soundUrl) {
        throw new Error('Could not find sound URL on the page');
      }

      // Make sure we have a complete URL
      if (!soundUrl.startsWith('http')) {
        soundUrl = `https://www.myinstants.com${soundUrl}`;
      }

      // Get the title of the sound
      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('title')
          .text()
          .replace(' - Instant Sound Button | Myinstants', '')
          .trim() ||
        'Unknown Sound';

      Logger.info('Successfully scraped sound from MyInstants', {
        title,
        soundUrl,
        sourceUrl: url,
      });

      return {
        soundUrl,
        title,
      };
    } catch (error) {
      Logger.error('Error scraping MyInstants', { url }, error);
      throw new Error(`Failed to scrape sound: ${error.message}`);
    }
  }

  /**
   * Downloads the audio file to a buffer
   *
   * FlareSolverr cannot proxy binary responses, so a blocked download is retried
   * with the clearance cookies obtained by solving a page on the same origin.
   * @param {string} soundUrl - Direct URL to the audio file
   * @returns {Promise<Buffer>} - Audio file as a buffer
   */
  async downloadSound(soundUrl) {
    try {
      Logger.debug('Downloading sound file', { soundUrl });

      let buffer;
      try {
        buffer = await this.http.getBuffer(soundUrl, this.buildHeaders());
      } catch (error) {
        if (
          !HttpClient.isCloudflareBlock(error.status) ||
          !this.flareSolverr.isEnabled()
        ) {
          throw error;
        }

        Logger.info('Download blocked, refreshing clearance via FlareSolverr', {
          soundUrl,
          status: error.status,
        });

        // Solve a challenge on the origin so we get fresh cf_clearance cookies
        await this.flareSolverr.get(new URL(soundUrl).origin);

        buffer = await this.http.getBuffer(soundUrl, this.buildHeaders());
      }

      Logger.debug('Successfully downloaded sound', {
        soundUrl,
        bufferSize: buffer.length,
      });

      return buffer;
    } catch (error) {
      Logger.error('Error downloading sound', { soundUrl }, error);
      throw new Error(`Failed to download sound: ${error.message}`);
    }
  }
}
