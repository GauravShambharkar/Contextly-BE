import { YoutubeTranscript } from "youtube-transcript";
import { fetchYouTubeMetadata } from "../fetchYouTubeMetadata/fetchYouTubeMetadata.js";
import { scrapeYouTubeMetadata } from "../scrapYoutubeMetaData/scrapYoutubeMetaData.js";

export interface YouTubeDataResult {
  transcriptText: string;
  usedTranscript: boolean;
  metadata: { title: string; description: string; channelTitle: string; tags?: string[] } | null;
}

/**
 * Fetches transcript or metadata fallback for a given YouTube video ID
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeDataResult> {
  let transcriptText = "";
  let usedTranscript = false;
  let metadata = null;

  // 1. Try to fetch YouTube captions/subtitles
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    transcriptText = transcript.map((t) => t.text).join(" ");

    if (transcriptText.length > 100) {
      usedTranscript = true;
    } else {
      transcriptText = "";
    }
  } catch {
    transcriptText = "";
    usedTranscript = false;
  }

  // 2. Fetch API metadata or web scraping
  metadata = await fetchYouTubeMetadata(videoId);
  if (!metadata) {
    metadata = await scrapeYouTubeMetadata(videoId);
  }

  return { transcriptText, usedTranscript, metadata };
}
