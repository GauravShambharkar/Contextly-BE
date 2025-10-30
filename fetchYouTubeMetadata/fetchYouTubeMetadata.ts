import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
/**
 * Fetches YouTube video metadata using YouTube Data API v3
 */
export async function fetchYouTubeMetadata(videoId: string): Promise<{
  title: string;
  description: string;
  channelTitle: string;
  tags?: string[];
  categoryId?: string;
} | null> {
  // Optional: YouTube Data API key for metadata fallback
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    console.warn(
      "YOUTUBE_API_KEY not set, skipping official API metadata fetch"
    );
    return null;
  }

  try {
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos`,
      {
        params: {
          part: "snippet",
          id: videoId,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (response.data.items && response.data.items.length > 0) {
      const snippet = response.data.items[0].snippet;
      return {
        title: snippet.title,
        description: snippet.description,
        channelTitle: snippet.channelTitle,
        tags: snippet.tags || [],
        categoryId: snippet.categoryId,
      };
    }
    return null;
  } catch (error) {
    console.error(
      "Error fetching YouTube metadata from API:",
      (error as any).message
    );
    return null;
  }
}
