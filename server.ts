import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import { apiReference } from "@scalar/express-api-reference";
import { extractVideoId } from "./extractVideoId/extractVideoId.js";
import { createPrompt } from "./createPrompt/createPrompt.js";
import { getYouTubeData } from "./services/youtubeService.js";
import { generateAISummary } from "./services/aiService.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: ["https://contextly-fe.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

// API Reference Docs
if (fs.existsSync("./openapi.json")) {
  const openApiSpec = JSON.parse(fs.readFileSync("./openapi.json", "utf-8"));
  app.use("/docs", apiReference({ theme: "purple", content: openApiSpec as any }));
}

// Health Check
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "YouTube Transcript Summarizer API is running!",
    timestamp: new Date().toISOString(),
  });
});

// Summarize Endpoint
app.post("/summarize", async (req: Request, res: Response) => {
  const { url, summarizeType } = req.body;

  if (!url || !summarizeType) {
    return res.status(400).json({
      error: "Missing required fields",
      details: "Both 'url' and 'summarizeType' are required",
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

    // 1. Fetch transcript or metadata
    const { transcriptText, usedTranscript, metadata } = await getYouTubeData(videoId);

    // 2. Create prompt
    const prompt = createPrompt(summarizeType, transcriptText, url, usedTranscript, metadata);

    // 3. Generate summary via Groq AI
    const { summary, provider, model } = await generateAISummary(prompt);

    return res.json({
      ok: true,
      videoId,
      type: summarizeType,
      usedTranscript,
      usedMetadata: !usedTranscript && metadata !== null,
      provider,
      model,
      metadata: metadata ? { title: metadata.title, channel: metadata.channelTitle } : null,
      url,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Summarization error:", error.message);
    return res.status(500).json({
      error: "Summarization failed",
      message: error.message || "An unexpected error occurred",
    });
  }
});

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found", message: "Endpoint does not exist" });
});

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
