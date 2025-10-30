/**
 * Creates a context-aware prompt based on summary type
 */

export function createPrompt(
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
    return `Analyze the transcript and extract only the actual information or key points based on ${summarizeType}.
          ${instruction} Focus strictly on factual, content-based data mentioned in the ${transcriptText} — not explanations, interpretations, or reworded summaries.
          Each point should directly reflect what is said, not what it means. Do NOT include phrases like “the video emphasizes,” “the discussion includes,” or “it covers.”
          Avoid adding context, explanations, or tone. Output should be concise, accurate, and purely content-based.
          Transcript: ${transcriptText.substring(0, 30000)} 
          **CRITICAL**: The final output must be only the extracted key points (plain text, no headings, no preamble).
          Output:`;
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
