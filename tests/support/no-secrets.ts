// Unit tests never use real credentials or a real endpoint, even if the shell has them.
for (const name of ["GEMINI_API_KEY", "GEMINI_BASE_URL", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI", "OPENAI_API_KEY"]) {
  delete process.env[name];
}
