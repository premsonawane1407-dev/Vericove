import { createServer, loadEnv } from 'vite';
const port = Number(process.env.PORT || 4173);
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
const server = await createServer({ server: { host: '127.0.0.1', port } });
await server.listen();
server.printUrls();
