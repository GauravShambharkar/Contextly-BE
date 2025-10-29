import express, { type Request, type Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.send({ msg: "YouTube Transcript Summarizer API is running!" });
});

// The GOOGLE_API_KEY environment variable is assumed to be set when running this code.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "v1");

const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

interface SummarizeRequest {
  url: string;
  summarizeType:
    | "in short"
    | "in brief"
    | "detailed"
    | "conclusion"
    | "key takeaways";
}

/**
 * Extracts the video ID from a YouTube URL.
 */
function extractVideoId(url: string): any {
  const match = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^\s&]+)/
  );
  return match ? match[1] : null;
}

app.post("/summarize", async (req: Request, res: Response) => {
  const { url, summarizeType }: SummarizeRequest = req.body;

  if (!url || !summarizeType) {
    return res.status(400).json({ error: "Missing url or summarizeType" });
  }

  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    let transcriptText = "";
    let usedTranscript = false;

    // Try fetching transcript
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcript.map((t) => t.text).join(" ");
      // Set to true only if transcript is substantial (more than 100 characters)
      usedTranscript = transcriptText.length > 100;
    } catch {
      console.warn("⚠️ No transcript found, falling back to URL analysis...");
      transcriptText = ""; // Clear text on failure
      usedTranscript = false;
    }

    // --- FINAL FIX: Explicitly instruct the model to use search and enforce short output ---
    const prompt = usedTranscript
      ? `You are an expert at summarizing YouTube videos. Your goal is to be specific and concise.
        Here’s the video transcript: 
        """
        ${transcriptText}
        """
        Please provide a ${summarizeType} summary that is clear, well-structured, and *concise*.`
      : `The YouTube video link is: ${url}. There is no transcript available. 
        **CRITICAL STEP**: You must use Google Search to find the *current, definitive* Title and Channel Name associated with this exact URL.
        Then, based **ONLY** on the confirmed Title and Channel Name, provide a ${summarizeType} summary that is **specific and short**, limited to **3 to 4 sentences** max, focusing only on the video's likely topic and main points. Do not mention inferred metadata or use titles/topics that contradict the search results.`;
    // --- End of FINAL FIX ---

    // Call Gemini
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

    res.json({
      success: true,
      type: summarizeType,
      usedTranscript,
      url,
      summary,
    });
  } catch (error: unknown) {
    // Improved TypeScript error handling
    console.error("Error during summarization:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    res
      .status(500)
      .json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});