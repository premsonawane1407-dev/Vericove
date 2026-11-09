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

function readJson(req, limit = 12_000) {
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
    }).filter(Boolean).join(' ').slice(0, 2_000);
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

function searchTerms(answers) {
  // Map the guided check-in's selected concern to a compact, clinically relevant query.
  // Other personal details (timing, impact, free text) are sent to Gemini only after opt-in.
  const concern = answers.find(answer => answer.questionKey === 'concern');
  const topics = {
    fatigue: ['fatigue', 'tiredness'],
    headache: ['headache', 'cephalalgia'],
    pelvic: ['pelvic pain', 'lower abdominal pain'],
    menstrual: ['menstrual cycle', 'menstrual irregularity'],
    sleep: ['sleep disturbance', 'insomnia'],
    digestive: ['gastrointestinal symptoms', 'digestive discomfort'],
  };
  const terms = topics[concern?.value];
  if (terms) return terms.map(term => `"${term}"[Title/Abstract]`).join(' OR ');
  if (concern?.value === 'other' && concern.text) {
    const phrase = concern.text.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    return phrase ? `"${phrase}"[Title/Abstract]` : '';
  }
  return '';
}

export function createSymptomIntelligenceHandler() {
  const recent = new Map();
  return async function handle(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(res, 405, { error: 'Use POST to request research context.' }); return; }
    if (!process.env.GEMINI_API_KEY) { send(res, 503, { error: 'Research is not connected yet. You can still use your conversation summary.' }); return; }
    const key = req.socket.remoteAddress || 'local', now = Date.now();
    const calls = (recent.get(key) || []).filter(time => now - time < 60_000);
    if (calls.length >= 4) { send(res, 429, { error: 'Please wait a moment before searching again.' }); return; }
    calls.push(now); recent.set(key, calls);
    try {
      const request = await readJson(req);
      const answers = Array.isArray(request.answers) ? request.answers.slice(0, 8).map(item => ({
        questionKey: String(item?.questionKey || '').slice(0, 32),
        value: /^[a-z0-9_-]{1,40}$/i.test(String(item?.value || '')) ? String(item.value) : '',
        label: String(item?.label || '').slice(0, 160),
        text: String(item?.text || '').trim().slice(0, 420),
      })).filter(item => item.text) : [];
      if (!answers.length) { send(res, 400, { error: 'There are no answers to explore yet.' }); return; }
      const terms = searchTerms(answers);
      if (!terms) {
        send(res, 200, { summary: 'There isn’t a specific topic to search from these answers yet. You can edit your first answer to add a few words about what you’d like to look up, then explore again.', articles: [], caveat: 'Only a general research search is possible until a topic is selected. This is not a symptom assessment.' });
        return;
      }
      const searchUrl = new URL(`${pubmed}/esearch.fcgi`);
      searchUrl.search = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '5', sort: 'relevance', term: terms }).toString();
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
      if (!articles.length) { send(res, 200, { summary: 'I couldn’t find a close match in the research results this time. That does not say anything about what you are experiencing. Your summary is still here if you would like to prepare questions for a clinician.', articles: [], caveat: 'This search is exploratory and cannot assess your symptoms.' }); return; }
      const evidence = articles.map(article => `PMID ${article.pmid}: ${article.title} (${article.year || 'year not listed'}). ${article.abstract || 'No abstract available.'}`).join('\n\n').slice(0, 8_500);
      const answerContext = answers.map(answer => `${answer.label}: ${answer.text}`).join('\n').slice(0, 3_000);
      const response = await fetch(gemini, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model: 'gemini-3.8-flash', store: false,
          system_instruction: 'You explain health research gently and plainly. You are not a clinician and must not diagnose, estimate likelihood, prescribe, recommend self-treatment, or imply an article applies to this person. Use ONLY the supplied PubMed records. Say when abstracts do not answer something. Distinguish population-level research from an individual experience. Cite relevant sources using their exact PMID numbers in square brackets. Never invent references. End with one practical question the user could take to a qualified healthcare professional. Keep the response to 2 short paragraphs plus 2 or 3 bullets at most.',
          input: `The person explicitly asked to explore research context for this private guided check-in. Their reported words (not a diagnosis):\n${answerContext}\n\nPubMed records retrieved for this search:\n${evidence}`,
          generation_config: { max_output_tokens: 500 },
        }),
      });
      if (!response.ok) { send(res, 502, { error: 'Gemini could not summarize the research just now. Your conversation remains available; try again in a moment.' }); return; }
      const interaction = await response.json();
      const knownPmids = new Set(articles.map(article => article.pmid));
      const summary = (interaction.steps || []).filter(step => step.type === 'model_output').flatMap(step => step.content || []).filter(part => part.type === 'text').map(part => part.text || '').join('\n').trim()
        .replace(/\[(?:PMID\s*)?(\d+)\]/gi, (citation, pmid) => knownPmids.has(pmid) ? `[PMID ${pmid}]` : '')
        .slice(0, 3_500);
      if (!summary) { send(res, 502, { error: 'Gemini returned an empty research summary. Please try again.' }); return; }
      send(res, 200, { summary, articles: articles.map(({ abstract, ...article }) => article), caveat: 'Research context is general information, not a diagnosis or a substitute for care. These papers may not apply to your individual situation.' });
    } catch (error) {
      if (res.headersSent || res.writableEnded) return;
      if (error.message === 'large') { send(res, 413, { error: 'This summary is too long to search.' }); return; }
      if (error.message === 'invalid') { send(res, 400, { error: 'The summary could not be prepared.' }); return; }
      send(res, 502, { error: error.message === 'pubmed' ? 'PubMed research could not be reached just now. Try again later.' : 'Research could not be prepared right now. Your conversation remains available; please try again.' });
    }
  };
}

export function symptomIntelligencePlugin() {
  const handler = createSymptomIntelligenceHandler();
  return { name: 'vericove-symptom-intelligence', configureServer(server) { server.middlewares.use('/api/symptom-intelligence', handler); } };
}
