import axios from 'axios';
import { config } from '../config/config.js';
import { Logger } from '../utils/logger.js';

/**
 * Client for a FlareSolverr instance (https://github.com/FlareSolverr/FlareSolverr)
 *
 * FlareSolverr drives a real Chrome instance to solve Cloudflare challenges and
 * returns the resulting HTML plus the clearance cookies. Those cookies are kept
 * here so HttpClient requests (e.g. binary downloads, which FlareSolverr cannot
 * proxy) can reuse them.
 *
 * Follows Single Responsibility Principle - only talks to FlareSolverr.
 */
export class FlareSolverrClient {
  constructor(options = {}) {
    this.url = options.url || config.flaresolverr.url;
    this.enabled = options.enabled ?? config.flaresolverr.enabled;
    this.maxTimeout = options.maxTimeout || config.flaresolverr.maxTimeout;
    this.sessionName = options.sessionName || config.flaresolverr.sessionName;

    /** @type {string|null} Active FlareSolverr session id, created lazily */
    this.sessionId = null;
    /** @type {string|null} User agent of the browser that solved the challenge */
    this.userAgent = null;
    /** @type {Array<{name: string, value: string}>} Latest clearance cookies */
    this.cookies = [];
  }

  /**
   * Whether FlareSolverr is configured and usable
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled && Boolean(this.url);
  }

  /**
   * Cookies from the last solved challenge, as a Cookie header value
   * @returns {string|null}
   */
  getCookieHeader() {
    if (this.cookies.length === 0) {
      return null;
    }
    return this.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Sends a command to the FlareSolverr /v1 endpoint
   * @param {object} payload - FlareSolverr command payload
   * @returns {Promise<object>} - Parsed FlareSolverr response
   */
  async command(payload) {
    const response = await axios.post(`${this.url}/v1`, payload, {
      headers: { 'Content-Type': 'application/json' },
      // Give the browser room to solve the challenge before the request gives up
      timeout: this.maxTimeout + 15000,
    });

    if (response.data?.status !== 'ok') {
      throw new Error(
        `FlareSolverr returned status "${response.data?.status}": ${response.data?.message}`
      );
    }

    return response.data;
  }

  /**
   * Creates the reusable browser session, if it does not exist yet.
   * A session keeps the solved cookies warm across requests, so only the first
   * sound of a session pays the challenge-solving cost.
   * @returns {Promise<string>} - The session id
   */
  async ensureSession() {
    if (this.sessionId) {
      return this.sessionId;
    }

    try {
      await this.command({ cmd: 'sessions.create', session: this.sessionName });
      Logger.info('Created FlareSolverr session', { session: this.sessionName });
    } catch (error) {
      // A session left behind by a previous run is fine - reuse it
      if (!/already exists/i.test(error.message)) {
        throw error;
      }
      Logger.debug('Reusing existing FlareSolverr session', {
        session: this.sessionName,
      });
    }

    this.sessionId = this.sessionName;
    return this.sessionId;
  }

  /**
   * Fetches a page through FlareSolverr, solving any Cloudflare challenge
   * @param {string} url - The page to fetch
   * @returns {Promise<{html: string, status: number, cookies: Array, userAgent: string}>}
   */
  async get(url) {
    if (!this.isEnabled()) {
      throw new Error('FlareSolverr is not enabled');
    }

    const session = await this.ensureSession();

    Logger.debug('Requesting page through FlareSolverr', { url, session });

    const data = await this.command({
      cmd: 'request.get',
      url,
      session,
      maxTimeout: this.maxTimeout,
    });

    const solution = data.solution || {};

    // Cache the clearance so binary downloads can reuse it
    this.cookies = solution.cookies || [];
    this.userAgent = solution.userAgent || this.userAgent;

    if (solution.status >= 400) {
      throw new Error(
        `FlareSolverr fetched ${url} but the site returned status ${solution.status}`
      );
    }

    Logger.debug('FlareSolverr solved request', {
      url,
      status: solution.status,
      cookieCount: this.cookies.length,
    });

    return {
      html: solution.response,
      status: solution.status,
      cookies: this.cookies,
      userAgent: this.userAgent,
    };
  }

  /**
   * Destroys the browser session held by FlareSolverr
   * @returns {Promise<void>}
   */
  async destroySession() {
    if (!this.sessionId) {
      return;
    }

    try {
      await this.command({ cmd: 'sessions.destroy', session: this.sessionId });
      Logger.info('Destroyed FlareSolverr session', { session: this.sessionId });
    } catch (error) {
      Logger.error('Error destroying FlareSolverr session', {}, error);
    } finally {
      this.sessionId = null;
    }
  }
}
