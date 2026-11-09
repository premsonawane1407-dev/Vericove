const pubmed = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const gemini = 'https://generativelanguage.googleapis.com/v1/interactions';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 2_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) { reject(new Error('large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid')); }
    });
    req.on('error', reject);
  });
}

function decodeXml(value = '') {
  return value.replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function collectAbstract(xml) {
  const section = xml.match(/<Abstract>([\s\S]*?)<\/Abstract>/i)?.[1] || '';
  return [...section.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi)]
    .map(match => {
      const label = match[1].match(/Label="([^"]+)"/i)?.[1];
      return `${label ? `${decodeXml(label)}: ` : ''}${decodeXml(match[2])}`;
    }).filter(Boolean).join(' ').slice(0, 1_800);
}

function safeArticles(xml) {
  return [...xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/gi)].slice(0, 5).map(([, record]) => {
    const pmid = tag(record, 'PMID').replace(/\D/g, '').slice(0, 12);
    const title = tag(record, 'ArticleTitle').slice(0, 360);
    const year = tag(record, 'Year') || record.match(/<PubDate>[\s\S]*?<MedlineDate>(\d{4})/i)?.[1] || '';
    const journal = tag(record, 'Title').slice(0, 180);
    return { pmid, title, year: year.slice(0, 4), journal, abstract: collectAbstract(record), url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` };
  }).filter(article => article.pmid && article.title);
}

function modelText(interaction, knownPmids) {
  return (interaction.steps || []).filter(step => step.type === 'model_output')
    .flatMap(step => step.content || []).filter(part => part.type === 'text')
    .map(part => part.text || '').join('\n').trim()
    .replace(/\[(?:PMID\s*)?(\d+)\]/gi, (citation, pmid) => knownPmids.has(pmid) ? `[PMID ${pmid}]` : '')
    .slice(0, 3_500);
}

export function createResearchAnalysisHandler() {
  const recent = new Map();
  return async function handle(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(res, 405, { error: 'Use POST to explore research.' }); return; }
    const key = req.socket.remoteAddress || 'local', now = Date.now();
    const calls = (recent.get(key) || []).filter(time => now - time < 60_000);
    if (calls.length >= 6) { send(res, 429, { error: 'Please wait a moment before searching again.' }); return; }
    calls.push(now); recent.set(key, calls);
    try {
      const request = await readJson(req);
      const question = String(request.question || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      const mode = request.mode === 'health-education' ? 'health-education' : 'research-intelligence';
      if (question.length < 4) { send(res, 400, { error: 'Add a little more detail to your question.' }); return; }
      if (request.consentAccepted !== true) { send(res, 400, { error: 'Review and accept the research privacy notice before continuing.' }); return; }
      const searchTerms = question.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
      const searchUrl = new URL(`${pubmed}/esearch.fcgi`);
      searchUrl.search = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '5', sort: 'relevance', term: `${searchTerms}[Title/Abstract]` }).toString();
      const search = await fetch(searchUrl, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
      if (!search.ok) throw new Error('pubmed');
      const searchData = await search.json();
      const ids = (searchData.esearchresult?.idlist || []).slice(0, 5).filter(id => /^\d{1,12}$/.test(id));
      let articles = [];
      if (ids.length) {
        const fetchUrl = new URL(`${pubmed}/efetch.fcgi`);
        fetchUrl.search = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'xml' }).toString();
        const records = await fetch(fetchUrl, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/xml' } });
        if (!records.ok) throw new Error('pubmed');
        articles = safeArticles(await records.text());
      }
      if (!articles.length) {
        send(res, 200, { analysis: '', articles: [], limitation: 'No close PubMed matches appeared for this wording. A search result is not a measure of how common or important a health concern is.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        send(res, 200, { analysis: '', articles: articles.map(({ abstract, ...article }) => article), limitation: 'AI summaries are not connected in this environment. These are PubMed search results, not a reviewed evidence synthesis.' });
        return;
      }
      const evidence = articles.map(article => `PMID ${article.pmid}: ${article.title} (${article.year || 'year not listed'}). Journal: ${article.journal || 'not listed'}. ${article.abstract || 'No abstract available.'}`).join('\n\n').slice(0, 8_500);
      const modeInstruction = mode === 'health-education'
        ? 'Explain established health concepts in plain language, distinguishing broad educational knowledge from what these specific papers can establish.'
        : 'Summarize what the retrieved studies investigated and reported, including study design or population only when stated in the supplied records.';
      const response = await fetch(gemini, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model: 'gemini-3.8-flash', store: false,
          system_instruction: `You explain women's health research gently and plainly. ${modeInstruction} Use ONLY the supplied PubMed records; do not invent prevalence, diagnoses, treatment advice, references, or certainty. Separate research findings from interpretation. Mention when abstracts leave a question unanswered. Cite every research claim with its exact PMID in square brackets. Keep the answer to two short paragraphs and up to three concise bullets. End with one evidence limitation. This is general educational information, not personal medical advice.`,
          input: `Question: ${question}\n\nPubMed records retrieved for this question:\n${evidence}`,
          generation_config: { max_output_tokens: 650 },
        }),
      });
      if (!response.ok) { send(res, 502, { error: 'The research summary could not be prepared just now. Please try again.' }); return; }
      const interaction = await response.json();
      const knownPmids = new Set(articles.map(article => article.pmid));
      const analysis = modelText(interaction, knownPmids);
      if (!analysis) { send(res, 502, { error: 'The research summary came back empty. Please try again.' }); return; }
      send(res, 200, { analysis, articles: articles.map(({ abstract, ...article }) => article), limitation: 'This is a brief summary of a small set of PubMed records. Abstracts can omit important context, and these findings may not apply to an individual.' });
    } catch (error) {
      if (res.headersSent || res.writableEnded) return;
      if (error.message === 'large') { send(res, 413, { error: 'That question is too long to search.' }); return; }
      if (error.message === 'invalid') { send(res, 400, { error: 'The question could not be prepared.' }); return; }
      send(res, 502, { error: error.message === 'pubmed' ? 'PubMed could not be reached just now. Please try again later.' : 'Research could not be prepared right now. Please try again.' });
    }
  };
}

export function researchAnalysisPlugin() {
  const handler = createResearchAnalysisHandler();
  return { name: 'vericove-research-analysis', configureServer(server) { server.middlewares.use('/api/research-analysis', handler); } };
}
