import { createSymptomIntelligenceHandler } from '../server/symptomIntelligenceService.mjs';

// The Gemini API key is read from the server-side environment only.
const handle = createSymptomIntelligenceHandler();

export default function symptomIntelligence(req, res) {
  return handle(req, res);
}
