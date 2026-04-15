import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'YouTube Transcript Summarizer API',
    description: 'API for summarizing YouTube videos using transcripts, metadata, and Google Gemini 2.5 Flash.',
    version: '1.0.0'
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local server'
    }
  ],
};

const outputFile = './openapi.json';
const routes = ['./server.ts'];

/* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

swaggerAutogen({ openapi: '3.0.0' })(outputFile, routes, doc).then(() => {
    console.log("Swagger UI Spec successfully generated in openapi.json");
});
