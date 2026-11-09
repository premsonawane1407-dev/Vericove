import { createResearchAnalysisHandler } from '../server/researchAnalysisService.mjs';

// The model key is read only by the server-side service.
const handle = createResearchAnalysisHandler();

export default function researchAnalysis(req, res) {
  return handle(req, res);
}
