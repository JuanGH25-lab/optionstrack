export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let target;
  try {
    target = new URL(decodeURIComponent(url));
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }

  const allowedHosts = [
    'gdcdyn.interactivebrokers.com',
    'interactivebrokers.com',
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
  ];

  if (!allowedHosts.some(h => target.hostname.endsWith(h))) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/xml,application/xml,*/*',
      },
      ...(req.method === 'POST' && req.body ? { body: JSON.stringify(req.body) } : {}),
    });

    const text = await upstream.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
}
