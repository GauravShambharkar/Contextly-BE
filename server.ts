import express, { type Request, type Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
dotenv.config();

const app = express();

const corsOption = {
  origin: "http://localhost:5173",
  METHODS: ["GET", "POST", "PUT", "DELETE"],
  Credential: true,
};

app.use(cors(corsOption));
app.use(express.json());

// Removed the custom interfaces (GeminiConfig and GenerateContentRequestPayload)
// to resolve the TypeScript incompatibility issue with the SDK's internal types.

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "YouTube Transcript Summarizer API is running!",
    timestamp: new Date().toISOString(),
  });
});

// Validate API key exists
if (!process.env.GOOGLE_API_KEY) {
  console.error("ERROR: GOOGLE_API_KEY is not set in environment variables");
  process.exit(1);
}

// Optional: YouTube Data API key for metadata fallback
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
// Changed to gemini-2.5-flash for reliability and robustness
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

interface SummarizeRequest {
  url: string;
  summarizeType:
    | "in short"
    | "in brief"
    | "in boolets"
    | "detailed"
    | "conclusion"
    | "key takeaways";
}

/**
 * Fetches YouTube video metadata using YouTube Data API v3
 */
async function fetchYouTubeMetadata(videoId: string): Promise<{
  title: string;
  description: string;
  channelTitle: string;
  tags?: string[];
  categoryId?: string;
} | null> {
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

/**
 * Scrapes basic metadata from YouTube page (fallback method)
 */
async function scrapeYouTubeMetadata(videoId: string): Promise<{
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

/**
 * Extracts the video ID from a YouTube URL.
 * Supports various YouTube URL formats.
 */
function extractVideoId(url: string): string | null {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
      /(?:youtube\.com\/embed\/)([^?\s]+)/,
      /(?:youtu\.be\/)([^?\s]+)/,
      /(?:youtube\.com\/v\/)([^?\s]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a context-aware prompt based on summary type
 */
function createPrompt(
  summarizeType: string,
  transcriptText: string,
  url: string,
  usedTranscript: boolean,
  metadata?: {
    title: string;
    description: string;
    channelTitle: string;
    tags?: string[];
  } | null
): string {
  const summaryInstructions: Record<string, string> = {
    "in short":
      "Provide a concise 2-3 sentence summary highlighting the main point.",
    "in brief":
      "Provide a brief 4-5 sentence summary covering the key boolets.",
    "in boolets":
      "Provide a point wise explaination in 5-7 boolets covering main topics. use numbers for boolets.",
    detailed:
      "Provide a comprehensive summary with main topics, key arguments, and important details in well-organized paragraphs.",
    conclusion:
      "Focus on the final takeaways, conclusions, and recommendations from the video.",
    "key takeaways":
      "List 5-7 key takeaways or main boolets as bullet boolets.",
  };

  const instruction =
    summaryInstructions[summarizeType] || summaryInstructions["in brief"];

  if (usedTranscript) {
    // Case 1: Transcript Available
    return `You are an expert at summarizing YouTube videos. Analyze the following transcript and create a ${summarizeType} summary.

${instruction}

Be specific, accurate, and well-structured. Focus on the actual content.

Transcript:

${transcriptText.substring(0, 30000)} 

**CRITICAL**: The final output must be *only* the summary text, with no preamble or headings.

Summary:`;
  } else if (metadata) {
    // Case 2: Transcript Missing, Metadata Available (Model is instructed to use Google Search here)
    return `You are an expert at summarizing YouTube videos. You must generate a ${summarizeType} summary of the video based on the provided metadata and any external context you can find using your tools.

Metadata to use:
Title: ${metadata.title}
Channel: ${metadata.channelTitle}
Description: ${metadata.description}
${
  metadata.tags && metadata.tags.length > 0
    ? `Tags: ${metadata.tags.join(", ")}`
    : ""
}

Instructions:
1. Adhere strictly to the requested summary type and length: ${instruction}
2. Synthesize the summary using the provided metadata, but use your external knowledge (Google Search) to provide a rich, accurate summary of the video's content.
3. **CRITICAL**: The final output must be *only* the summary text, with no preamble, headings, or concluding remarks about the source of the information.

Summary:`;
  } else {
    // Case 3: Neither Available
    return `You are analyzing a YouTube video URL: ${url}

IMPORTANT: No transcript or metadata is available for this video. You MUST NOT make up or infer content.

Your response should be EXACTLY in this format:
"Unable to generate a ${summarizeType} summary because neither transcript nor metadata is available for this video. Please try a different video with available captions/subtitles."

Do not speculate, infer, or create fictional content. Simply return the message above.`;
  }
}

app.post("/summarize", async (req: Request, res: Response) => {
  const { url, summarizeType }: SummarizeRequest = req.body;

  // Validation
  if (!url || !summarizeType) {
    return res.status(400).json({
      error: "Missing required fields",
      details: "Both 'url' and 'summarizeType' are required",
    });
  }

  const validTypes = [
    "in short",
    "in brief",
    "in boolets",
    "detailed",
    "conclusion",
    "key takeaways",
  ];
  if (!validTypes.includes(summarizeType)) {
    return res.status(400).json({
      error: "Invalid summarizeType",
      details: `Must be one of: ${validTypes.join(", ")}`,
    });
  }

  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        error: "Invalid YouTube URL",
        details: "Please provide a valid YouTube video URL",
      });
    }

    let transcriptText = "";
    let usedTranscript = false;
    let metadata = null;

    // Attempt to fetch transcript
    try {
      console.log(`Fetching transcript for video ID: ${videoId}`);
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcript.map((t) => t.text).join(" ");

      // Only use transcript if substantial
      if (transcriptText.length > 100) {
        usedTranscript = true;
        console.log(
          `Transcript fetched successfully (${transcriptText.length} characters)`
        );
      } else {
        console.warn(
          "Transcript too short, falling back to metadata and search"
        );
        transcriptText = "";
        usedTranscript = false;
      }
    } catch (error) {
      console.warn("No transcript available, will try metadata and search");
      transcriptText = "";
      usedTranscript = false;
    }

    // If no transcript, try to fetch metadata
    if (!usedTranscript) {
      console.log("Attempting to fetch video metadata...");

      // Try YouTube Data API first
      metadata = await fetchYouTubeMetadata(videoId);

      // Fallback to web scraping if API not available or failed
      if (!metadata) {
        console.log("Falling back to web scraping for metadata...");
        metadata = await scrapeYouTubeMetadata(videoId);
      }

      if (metadata) {
        console.log(
          `Metadata fetched: "${metadata.title}" by ${metadata.channelTitle}`
        );
      } else {
        console.warn("No metadata could be retrieved");
      }
    }

    // Generate prompt
    const prompt = createPrompt(
      summarizeType,
      transcriptText,
      url,
      usedTranscript,
      metadata
    );

    // --- FIX IMPLEMENTATION: Correct SDK payload structure ---
    let searchEnabled = false;
    // We must define 'tools' at the root level of the request object for the SDK
    let tools: any[] | undefined = undefined;

    // If we only have metadata (or nothing), enable Google Search for grounding and context
    if (!usedTranscript && metadata) {
      // Correct structure: tools is an array of tool objects, placed at the root of the request.
      tools = [{ googleSearch: {} }];
      searchEnabled = true;
      console.log(
        "Enabling Google Search grounding for enhanced metadata summary."
      );
    }
    // ----------------------------------------------------

    // Call Gemini API
    console.log(`Generating ${summarizeType} summary...`);

    // Construct the request payload directly as an object literal.
    // Use 'any' type for simplicity to match SDK's runtime expectations.
    const requestPayload: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      // Conditionally include 'tools' directly (fixes the "Unknown name 'tools' at 'generation_config'" error)
      ...(tools && { tools }),
    };

    const result = await model.generateContent(requestPayload);
    // Use .text to get the generated content from the response object
    const summary = result.response.text().trim();

    // Successful response
    res.json({
      ok: true,
      videoId,
      type: summarizeType,
      usedTranscript,
      usedMetadata: !usedTranscript && metadata !== null,
      usedSearchGrounding: searchEnabled, // Include new field for visibility
      metadata: metadata
        ? {
            title: metadata.title,
            channel: metadata.channelTitle,
          }
        : undefined,
      url,
      summary,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `Summary generated successfully (Search Grounding: ${searchEnabled})`
    );
  } catch (error: unknown) {
    console.error("Error during summarization:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    const errorDetails = error instanceof Error ? error.stack : undefined;

    res.status(500).json({
      error: "Summarization failed",
      message: errorMessage,
      ...(process.env.NODE_ENV === "development" && { details: errorDetails }),
    });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested endpoint does not exist",
  });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Summarize endpoint: POST http://localhost:${PORT}/summarize`);
});
