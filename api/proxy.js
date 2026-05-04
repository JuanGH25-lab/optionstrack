// api/proxy.js — Vercel Serverless Function
// Proxy pour Interactive Brokers Flex Query + Yahoo Finance (prix temps réel)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const allowedDomains = [
    'gdcdyn.interactivebrokers.com',
    'www.interactivebrokers.com',
    'interactivebrokers.com',
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
    'finance.yahoo.com',
  ];

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const isAllowed = allowedDomains.some(d => parsedUrl.hostname.endsWith(d));
  if (!isAllowed) return res.status(403).json({ error: 'Domain not allowed' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();

    res.setHeader('Content-Type', contentType);
    return res.status(response.status).send(text);

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}
