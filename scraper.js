import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Scrapes a MyInstants sound URL and extracts the audio file URL
 * @param {string} url - The MyInstants page URL (e.g., https://www.myinstants.com/es/instant/queri-too-87417/)
 * @returns {Promise<{soundUrl: string, title: string}>} - The direct audio file URL and sound title
 */
export async function scrapeMyInstantsSound(url) {
  try {
    // Validate URL is from myinstants.com
    if (!url.includes("myinstants.com")) {
      throw new Error("URL must be from myinstants.com");
    }

    // Fetch the page
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    // Parse HTML with cheerio
    const $ = cheerio.load(response.data);

    let soundUrl = null;

    // Method 1: Look for the download button (most reliable)
    // <a href="/media/sounds/..." download="" ... class="instant-page-extra-button btn btn-primary">
    const downloadButton = $('a[download][href*="/media/sounds/"]');
    if (downloadButton.length > 0) {
      soundUrl = downloadButton.attr("href");
      console.log("Found sound URL from download button:", soundUrl);
    }

    // Method 2: Find the play button with onclick attribute
    if (!soundUrl) {
      const soundButton = $(".small-button").first();
      const onclickAttr = soundButton.attr("onclick");

      if (onclickAttr) {
        const match = onclickAttr.match(/play\('([^']+)'/);
        if (match && match[1]) {
          soundUrl = match[1];
          console.log("Found sound URL from onclick:", soundUrl);
        }
      }
    }

    // Method 3: Try data-url attribute
    if (!soundUrl) {
      const soundButton = $(".small-button").first();
      soundUrl = soundButton.attr("data-url");
      if (soundUrl) {
        console.log("Found sound URL from data-url:", soundUrl);
      }
    }

    // Method 4: Look for audio source tag
    if (!soundUrl) {
      const audioSource = $("source").attr("src");
      if (audioSource) {
        soundUrl = audioSource;
        console.log("Found sound URL from audio source:", soundUrl);
      }
    }

    if (!soundUrl) {
      throw new Error("Could not find sound URL on the page");
    }

    // Make sure we have a complete URL
    if (!soundUrl.startsWith("http")) {
      soundUrl = `https://www.myinstants.com${soundUrl}`;
    }

    // Get the title of the sound
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title")
        .text()
        .replace(" - Instant Sound Button | Myinstants", "")
        .trim() ||
      "Unknown Sound";

    console.log(`Found sound: ${title} - ${soundUrl}`);

    return {
      soundUrl,
      title,
    };
  } catch (error) {
    console.error("Error scraping MyInstants:", error.message);
    throw new Error(`Failed to scrape sound: ${error.message}`);
  }
}

/**
 * Downloads the audio file to a buffer
 * @param {string} soundUrl - Direct URL to the audio file
 * @returns {Promise<Buffer>} - Audio file as a buffer
 */
export async function downloadSound(soundUrl) {
  try {
    const response = await axios.get(soundUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error downloading sound:", error.message);
    throw new Error(`Failed to download sound: ${error.message}`);
  }
}
