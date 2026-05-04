// api/proxy.js — Vercel Serverless Function
// Proxy vers l'API Interactive Brokers Flex Query
// Contourne les restrictions CORS du navigateur

export default async function handler(req, res) {
  // CORS headers — permet à n'importe quel navigateur d'appeler cette fonction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Sécurité : on n'autorise que les domaines IB
  const allowedDomains = [
    'gdcdyn.interactivebrokers.com',
    'www.interactivebrokers.com',
    'interactivebrokers.com',
  ];

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const isAllowed = allowedDomains.some(d => parsedUrl.hostname.endsWith(d));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OptionsTrack/1.0)',
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    const text = await response.text();

    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/xml');
    return res.status(response.status).send(text);

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}
