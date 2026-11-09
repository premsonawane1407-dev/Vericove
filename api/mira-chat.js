import { createMiraChatHandler } from '../server/miraChatService.mjs';

// Vercel production entry point. The Gemini key is read only from the
// server-side GEMINI_API_KEY environment variable.
const handleMiraChatRequest = createMiraChatHandler();

export default function miraChat(req, res) {
  return handleMiraChatRequest(req, res);
}
