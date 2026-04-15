import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "YouTube Transcript Summarizer API",
    description:
      "API for summarizing YouTube videos using transcripts, metadata, and Google Gemini 2.5 Flash.",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local server",
    },
  ],
  tags: [
    {
      name: "Health",
      description:
        "Endpoints related to checking API connectivity and health status.",
    },
    {
      name: "main",
      description: "Main AI-powered tools such as YouTube summarization.",
    },
    {
      name: "tool",
      description: "Additional helper tools and utilities.",
    },
  ],
  definitions: {
    SummarizeRequest: {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      summarizeType: "detailed",
    },
  },
};

const outputFile = "./openapi.json";
const routes = ["./server.ts"];

/* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

swaggerAutogen({ openapi: "3.0.0" })(outputFile, routes, doc).then(() => {
  console.log("Swagger UI Spec successfully generated in openapi.json");
});
