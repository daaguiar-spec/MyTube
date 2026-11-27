// Proxy da YouTube Data API com cache compartilhado na CDN da Vercel.
// A chave fica na variável de ambiente YOUTUBE_KEY (nunca no código).
const RULES = {
  channels:      { params: ['part', 'id', 'forHandle'], ttl: 7 * 86400 },
  playlistItems: { params: ['part', 'playlistId', 'maxResults'], ttl: 3600 },
  videos:        { params: ['part', 'id'], ttl: 30 * 86400 },
  search:        { params: ['part', 'q', 'type', 'safeSearch', 'maxResults', 'regionCode', 'relevanceLanguage', 'videoEmbeddable'], ttl: 7 * 86400 }
};
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://x');
  const path = url.searchParams.get('path');
  const rule = RULES[path];
  if (!rule) return res.status(400).json({ error: { message: 'Endpoint não permitido' } });

  const ref = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  const okRef = !ref || ref.includes(host) || ALLOWED_HOSTS.some(h => ref.includes(h));
  if (!okRef) return res.status(403).json({ error: { message: 'Origem não permitida' } });

  if (!process.env.YOUTUBE_KEY) return res.status(500).json({ error: { message: 'Servidor sem chave configurada' } });

  const q = new URLSearchParams();
  for (const k of rule.params) { const v = url.searchParams.get(k); if (v != null && v !== '') q.set(k, v.slice(0, 600)); }
  if (path === 'search') q.set('safeSearch', 'strict');
  if (path === 'playlistItems') q.set('maxResults', String(Math.min(+q.get('maxResults') || 15, 50)));
  if (path === 'search') q.set('maxResults', String(Math.min(+q.get('maxResults') || 15, 25)));
  q.set('key', process.env.YOUTUBE_KEY);

  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + q);
    const j = await r.json();
    if (j.error) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(r.status || 500).json({ error: { message: j.error.message } });
    }
    res.setHeader('Cache-Control', `public, s-maxage=${rule.ttl}, stale-while-revalidate=${rule.ttl}`);
    return res.status(200).json(j);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: { message: 'Falha ao falar com o YouTube' } });
  }
};
