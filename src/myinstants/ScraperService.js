import * as cheerio from 'cheerio';
import { FlareSolverrClient } from './FlareSolverrClient.js';
import { HttpClient } from './HttpClient.js';
import { Logger } from '../utils/logger.js';

const BASE_URL = 'https://www.myinstants.com';
const SEARCH_CACHE_TTL = 10 * 60 * 1000;
const SEARCH_CACHE_SIZE = 200;

/**
 * Service for scraping sounds from MyInstants
 */
export class ScraperService {
  /**
   * @param {HttpClient} [httpClient] - Chrome-impersonating HTTP client
   * @param {FlareSolverrClient} [flareSolverr] - Challenge solver, used as fallback
   */
  constructor(httpClient = new HttpClient(), flareSolverr = new FlareSolverrClient()) {
    this.http = httpClient;
    this.flareSolverr = flareSolverr;
    /** @type {Map<string, {time: number, results: Array}>} */
    this.searchCache = new Map();
  }

  /**
   * Parse a MyInstants link (absolute or site-relative path)
   * @param {string} input
   * @returns {string|null} - Absolute URL, or null if it is not a myinstants.com link
   */
  static toMyInstantsUrl(input) {
    try {
      const url = new URL(input, BASE_URL);
      const isMyInstants = url.hostname === 'myinstants.com' || url.hostname.endsWith('.myinstants.com');
      return isMyInstants && ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
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
   * Search MyInstants by name. Results are cached in memory for a few minutes.
   * Does not fall back to FlareSolverr: it is used by autocomplete, which must answer fast.
   * @param {string} query
   * @returns {Promise<Array<{title: string, pageUrl: string, soundUrl: string}>>}
   */
  async search(query) {
    const key = query.trim().toLowerCase();
    if (!key) return [];

    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.time < SEARCH_CACHE_TTL) {
      return cached.results;
    }

    const html = await this.http.getText(
      `${BASE_URL}/en/search/?name=${encodeURIComponent(key)}`,
      this.buildHeaders()
    );
    const $ = cheerio.load(html);

    const results = $('.instant').map((_, el) => {
      const link = $(el).find('a.instant-link');
      const soundPath = $(el).find('.small-button').attr('onclick')?.match(/play\('([^']+)'/)?.[1];
      const pageUrl = ScraperService.toMyInstantsUrl(link.attr('href') ?? '');
      const soundUrl = soundPath && ScraperService.toMyInstantsUrl(soundPath);
      return pageUrl && soundUrl ? { title: link.text().trim(), pageUrl, soundUrl } : null;
    }).get();

    this.searchCache.delete(key);
    this.searchCache.set(key, { time: Date.now(), results });
    if (this.searchCache.size > SEARCH_CACHE_SIZE) {
      this.searchCache.delete(this.searchCache.keys().next().value);
    }

    Logger.debug('Searched MyInstants', { query: key, results: results.length });
    return results;
  }

  /**
   * Scrapes a MyInstants sound page and extracts the audio file URL
   * @param {string} url - The MyInstants page URL
   * @returns {Promise<{soundUrl: string, title: string}>}
   */
  async scrapeMyInstantsSound(url) {
    try {
      if (!ScraperService.toMyInstantsUrl(url)) {
        throw new Error('URL must be from myinstants.com');
      }

      const $ = cheerio.load(await this.fetchPage(url));

      const onclick = $('.small-button, .large-button').first().attr('onclick');
      const candidates = [
        $('a[download][href*="/media/sounds/"]').attr('href'),
        onclick?.match(/play\('([^']+)'/)?.[1],
        $('.small-button, .large-button').first().attr('data-url'),
        $('source').attr('src'),
        $('meta[property="og:audio"]').attr('content'),
      ];

      const found = candidates.find(Boolean);
      if (!found) {
        throw new Error('Could not find sound URL on the page');
      }

      const soundUrl = ScraperService.toMyInstantsUrl(found);
      if (!soundUrl) {
        throw new Error('Sound file is not hosted on myinstants.com');
      }

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        'Unknown Sound';

      Logger.debug('Scraped sound from MyInstants', { title, soundUrl, sourceUrl: url });

      return { soundUrl, title };
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
      if (!ScraperService.toMyInstantsUrl(soundUrl)) {
        throw new Error('Sound file is not hosted on myinstants.com');
      }

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

      Logger.debug('Downloaded sound', { soundUrl, bufferSize: buffer.length });

      return buffer;
    } catch (error) {
      Logger.error('Error downloading sound', { soundUrl }, error);
      throw new Error(`Failed to download sound: ${error.message}`);
    }
  }
}
