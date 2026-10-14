// Unit tests never use real credentials or a real endpoint, even if the shell has them.
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
