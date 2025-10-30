import axios from "axios";

/**
 * Scrapes basic metadata from YouTube page (fallback method)
 */
export async function scrapeYouTubeMetadata(videoId: string): Promise<{
  title: string;
  description: string;
  channelTitle: string;
} | null> {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const html = response.data;

    // Extract title
    const titleMatch = html.match(/<title>(.+?)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "").trim()
      : "";

    // Extract description from meta tag
    const descMatch = html.match(/<meta name="description" content="(.+?)"/);
    const description = descMatch ? descMatch[1] : "";

    // Extract channel name
    const channelMatch = html.match(/"author":"(.+?)"/);
    const channelTitle = channelMatch ? channelMatch[1] : ""; // Fixed: Changed channelTitle[1] to channelMatch[1]

    if (title && channelTitle) {
      return { title, description, channelTitle };
    }
    return null;
  } catch (error) {
    console.error(" Error scraping YouTube metadata:", (error as any).message);
    return null;
  }
}