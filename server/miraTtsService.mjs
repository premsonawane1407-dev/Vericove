import { miraVoiceMessages } from '../src/miraVoiceMessages.js';

const MIRA_VOICE_STYLES = {
  hello: 'Speak in a warm, youthful adult feminine voice. Gentle, calm and reassuring with a light, natural lift in intonation. Neutral Indian English with a subtle international quality; soft medium-high pitch, clear and conversational.',
  checkin: 'Speak in a warm adult feminine voice, calm and supportive with a little natural energy. Neutral Indian English. Gentle pacing and a reassuring pause.',
  listening: 'Speak in a warm adult feminine voice, kindly curious and attentive without being intrusive. Neutral Indian English. Calm, lightly expressive and conversational.',
  break: 'Speak in a warm adult feminine voice, gentle and caring like a thoughtful friend. Neutral Indian English, calm pace with a small playful lift.',
  journal: 'Speak in a warm adult feminine voice, soft and encouraging with a little natural energy. Neutral Indian English, clear and conversational with natural pauses.',
  together: 'Speak in a warm adult feminine voice, supportive and grounded. Neutral Indian English. Calm, clear, reassuring and gently animated.',
  welcome: 'Speak in a warm adult feminine voice, gently happy and friendly, with restrained but lively warmth. Neutral Indian English.',
  curious: 'Speak in a warm adult feminine voice, kind and attentive. Neutral Indian English. Calmly curious without sounding clinical or pushy.',
};

const MIRA_VOICE_MESSAGES = Object.fromEntries(miraVoiceMessages.map(message => [
  message.id,
  { text: message.text, textHi: message.textHi, style: MIRA_VOICE_STYLES[message.id] },
]));

const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readVoiceRequest(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5000) {
        reject(new Error('large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('invalid')); }
    });
    req.on('error', reject);
  });
}

function getAudio(payload) {
  if (payload.output_audio?.data) return payload.output_audio;
  return (payload.steps || []).flatMap(step => step.content || []).find(block => block.type === 'audio' && block.data);
}

export function miraTtsPlugin() {
  const audioCache = new Map();
  const rateLimits = new Map();
  return {
    name: 'vericove-mira-tts',
    configureServer(server) {
      server.middlewares.use('/api/mira-voice', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          json(res, 405, { error: 'Method not allowed.' });
          return;
        }

        const now = Date.now();
        const ip = req.socket.remoteAddress || 'local';
        const recent = (rateLimits.get(ip) || []).filter(time => now - time < 60_000);
        if (recent.length >= 12) {
          json(res, 429, { error: 'Please wait a moment before asking Mira to speak again.' });
          return;
        }
        recent.push(now);
        rateLimits.set(ip, recent);

        try {
          const request = await readVoiceRequest(req);
          const configuredMessage = MIRA_VOICE_MESSAGES[request.messageId];
          const language = request.language === 'hi' ? 'hi' : 'en';
          const dynamicText = typeof request.text === 'string' ? request.text.trim() : '';
          const cacheable = !dynamicText && Boolean(configuredMessage);
          if (dynamicText.length > 1600 || (!configuredMessage && !dynamicText) || (configuredMessage && language === 'hi' && !configuredMessage.textHi)) {
            json(res, 400, { error: 'Unknown Mira message.' });
            return;
          }
          const text = dynamicText || (language === 'hi' ? configuredMessage.textHi : configuredMessage.text);
          const style = language === 'hi'
            ? 'Speak this in natural conversational Hindi in a warm adult feminine voice. Keep it calm, gentle and reassuring, with a little friendly energy and clear Hindi pronunciation.'
            : configuredMessage?.style || 'Speak in a warm, calm, adult feminine voice. Gentle, natural pacing, emotionally attentive and conversational. Neutral Indian English with clear pronunciation.';
          const cacheKey = `${language}:${text}`;
          if (cacheable && audioCache.has(cacheKey)) {
            const cached = audioCache.get(cacheKey);
            res.statusCode = 200;
            res.setHeader('Content-Type', cached.mimeType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(cached.data);
            return;
          }

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            json(res, 503, { error: 'Gemini voice is not configured.' });
            return;
          }
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              model: 'gemini-3.8-flash-tts',
              input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
              response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
              generation_config: { speech_config: [{ voice: 'Vindemiatrix' }] },
              store: false,
            }),
          });
          if (!response.ok) {
            json(res, 502, { error: 'Mira could not reach the voice service.' });
            return;
          }
          const audio = getAudio(await response.json());
          if (!audio?.data) {
            json(res, 502, { error: 'The voice service returned no audio.' });
            return;
          }
          const result = { data: Buffer.from(audio.data, 'base64'), mimeType: audio.mime_type || 'audio/wav' };
          if (cacheable) audioCache.set(cacheKey, result);
          res.statusCode = 200;
          res.setHeader('Content-Type', result.mimeType);
          res.setHeader('Cache-Control', cacheable ? 'public, max-age=86400' : 'no-store');
          res.end(result.data);
        } catch (error) {
          if (res.headersSent || res.writableEnded) return;
          const tooLarge = error.message === 'large';
          json(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Voice request was too large.' : 'Unable to prepare Mira’s voice message.' });
        }
      });
    },
  };
}
