import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.error("ERROR: GROQ_API_KEY is missing from environment variables!");
}

const groq = new Groq({ apiKey: groqApiKey || "" });

export interface AISummaryResult {
  summary: string;
  provider: string;
  model: string;
}

/**
 * Generates an AI summary exclusively using Groq (llama-3.3-70b-versatile)
 */
export async function generateAISummary(prompt: string): Promise<AISummaryResult> {
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured in environment variables.");
  }

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are an expert AI YouTube summarizer. Provide clear, well-structured, and concise summaries.",
      },
      { role: "user", content: prompt },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.5,
    max_completion_tokens: 1500,
  });

  const summary = completion.choices[0]?.message?.content?.trim() || "";

  if (!summary) {
    throw new Error("Groq API returned an empty response.");
  }

  return {
    summary,
    provider: "Groq",
    model: "llama-3.3-70b-versatile",
  };
}
