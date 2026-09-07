import { Impit } from 'impit';
import { Logger } from '../utils/logger.js';

/** Status codes Cloudflare uses when it blocks or challenges a request */
const CLOUDFLARE_STATUS_CODES = [403, 429, 503];

/**
 * HTTP client that impersonates a real Chrome TLS/HTTP2 fingerprint.
 *
 * MyInstants sits behind Cloudflare, which fingerprints the TLS handshake:
 * plain axios/node requests get a 403 no matter what headers they send. impit
 * replays Chrome's handshake, so requests pass. When Cloudflare escalates to a
 * JavaScript challenge (which impit cannot execute), the caller falls back to
 * FlareSolverr.
 *
 * Follows Single Responsibility Principle - only performs HTTP requests.
 */
export class HttpClient {
  constructor(options = {}) {
    this.impit = new Impit({
      browser: options.browser || 'chrome',
      followRedirects: true,
      timeout: options.timeout || 30000,
    });
  }

  /**
   * Whether a response status means Cloudflare blocked or challenged us
   * @param {number} status - HTTP status code
   * @returns {boolean}
   */
  static isCloudflareBlock(status) {
    return CLOUDFLARE_STATUS_CODES.includes(status);
  }

  /**
   * Performs a GET request
   * @param {string} url - URL to fetch
   * @param {object} [headers] - Extra request headers
   * @returns {Promise<Response>} - The fetch-style response
   */
  async get(url, headers = {}) {
    const response = await this.impit.fetch(url, { headers });

    if (!response.ok) {
      const error = new Error(`Request to ${url} failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response;
  }

  /**
   * Fetches a URL as text
   * @param {string} url - URL to fetch
   * @param {object} [headers] - Extra request headers
   * @returns {Promise<string>}
   */
  async getText(url, headers = {}) {
    const response = await this.get(url, headers);
    return response.text();
  }

  /**
   * Fetches a URL as a binary buffer
   * @param {string} url - URL to fetch
   * @param {object} [headers] - Extra request headers
   * @returns {Promise<Buffer>}
   */
  async getBuffer(url, headers = {}) {
    const response = await this.get(url, headers);
    const buffer = Buffer.from(await response.arrayBuffer());

    Logger.debug('Fetched binary response', { url, bytes: buffer.length });

    return buffer;
  }
}
