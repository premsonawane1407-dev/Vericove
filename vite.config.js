import { defineConfig, loadEnv } from 'vite';
import { autoContentPlugin } from './server/autoContentService.mjs';
import { miraTtsPlugin } from './server/miraTtsService.mjs';
import { miraChatPlugin } from './server/miraChatService.mjs';

const previewWithMiddleware = plugin => ({
  ...plugin,
  configurePreviewServer(server) {
    plugin.configureServer?.(server);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

  const autoContent = autoContentPlugin();
  const miraTts = miraTtsPlugin();
  const miraChat = miraChatPlugin();
  return {
    plugins: [previewWithMiddleware(autoContent), previewWithMiddleware(miraTts), previewWithMiddleware(miraChat)],
  };
});
