import { createServer } from 'vite';
import { autoContentPlugin } from './server/autoContentService.mjs';
const port = Number(process.env.PORT || 4173);
const server = await createServer({ plugins: [autoContentPlugin()], server: { host: '127.0.0.1', port } });
await server.listen();
server.printUrls();
