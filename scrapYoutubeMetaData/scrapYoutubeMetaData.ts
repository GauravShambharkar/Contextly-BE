import axios from "axios";

/**
 * Fetches basic metadata from YouTube oEmbed API (reliable fallback method)
 */
export async function scrapeYouTubeMetadata(videoId: string): Promise<{
  title: string;
  description: string;
  channelTitle: string;
} | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await axios.get(url);

    const data = response.data;
    
    if (data && data.title && data.author_name) {
      return {
        title: data.title,
        description: "", // oEmbed doesn't provide description, but it's enough for UI
        channelTitle: data.author_name,
      };
    }
    
    return null;
  } catch (error) {
    console.error(" Error fetching YouTube oEmbed metadata:", (error as any).message);
    return null;
  }
}