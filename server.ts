import express, { type Request, type Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import { createPrompt } from "./createPrompt/createPrompt.js";
import { extractVideoId } from "./extractVideoId/extractVideoId.js";
import { scrapeYouTubeMetadata } from "./scrapYoutubeMetaData/scrapYoutubeMetaData.js";
import { fetchYouTubeMetadata } from "./fetchYouTubeMetadata/fetchYouTubeMetadata.js";
import fs from "fs";
import { apiReference } from '@scalar/express-api-reference';

dotenv.config();

const app = express();

const corsOption = {
  origin: ["https://contextly-fe.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

app.use(cors(corsOption));
app.use(express.json());
const openApiSpec = JSON.parse(fs.readFileSync("./openapi.json", "utf-8"));

app.use(
  "/docs",
  apiReference({
    theme: "purple",
    content: openApiSpec as any,
  })
);

// Removed the custom interfaces (GeminiConfig and GenerateContentRequestPayload)
// to resolve the TypeScript incompatibility issue with the SDK's internal types.

// Health check endpoint
app.get("/", (_req: Request, res: Response) => {
  // #swagger.tags = ['Health']
  res.json({
    status: "ok",
    message: "YouTube Transcript Summarizer API is running!",
    timestamp: new Date().toISOString(),
  });
});


app.get("/newHealthRoute", (_req: Request, res: Response) => {
  // #swagger.tags = ['Health']
  res.json({
    status: "ok",
    message: "YouTube Transcript Summarizer API is running!",
    timestamp: new Date().toISOString(),
  });
});
app.get("/tool", (_req: Request, res: Response) => {
  // #swagger.tags = ['tool']
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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
// Using gemini-2.0-flash (confirmed available for this API key)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });


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

app.post("/summarize", async (req: Request, res: Response) => {
  // #swagger.tags = ['main']
  /* #swagger.parameters['body'] = {
        in: 'body',
        description: 'Summarization request details.',
        schema: { $ref: '#/definitions/SummarizeRequest' }
  } */
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
    if (!usedTranscript) {
      // Use googleSearchRetrieval for AI Studio / Public API SDK
      tools = [{ googleSearchRetrieval: {} }];
      searchEnabled = true;
      console.log(
        "Enabling Google Search grounding for enhanced summary (Transcript missing)."
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
        : null,
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
