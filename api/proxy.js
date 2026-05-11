// api/proxy.js — Vercel Serverless Function
// Proxy pour Interactive Brokers Flex Query + Yahoo Finance (prix + secteurs)

let yahoocrumb = null;
let yahooCookie = null;
let crumbFetchedAt = 0;
const CRUMB_TTL = 60 * 60 * 1000; // 1 heure

async function getYahooCrumb() {
  const now = Date.now();
  if (yahoocrumb && yahooCookie && (now - crumbFetchedAt) < CRUMB_TTL) {
    return { crumb: yahoocrumb, cookie: yahooCookie };
  }

  try {
    // Step 1: get a cookie from Yahoo Finance homepage
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const cookies = r1.headers.get('set-cookie') || '';
    // Extract the A3 or session cookie
    const cookieMatch = cookies.match(/(A3=[^;]+)/);
    const sessionCookie = cookieMatch ? cookieMatch[1] : '';

    // Step 2: get crumb using the cookie
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': sessionCookie,
      },
    });

    const crumb = await r2.text();
    if (crumb && crumb.length > 0 && !crumb.includes('{')) {
      yahoocrumb = crumb.trim();
      yahooCookie = sessionCookie;
      crumbFetchedAt = now;
      return { crumb: yahoocrumb, cookie: yahooCookie };
    }
  } catch (e) {
    console.error('Failed to get Yahoo crumb:', e.message);
  }
  return null;
}

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

  const isYahoo = parsedUrl.hostname.includes('yahoo.com');
  const isQuoteSummary = url.includes('quoteSummary') || url.includes('quote?');

  try {
    let fetchUrl = url;
    let headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // For Yahoo quoteSummary endpoints that need crumb auth
    if (isYahoo && isQuoteSummary) {
      const auth = await getYahooCrumb();
      if (auth) {
        // Add crumb as query param
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = fetchUrl + separator + 'crumb=' + encodeURIComponent(auth.crumb);
        headers['Cookie'] = auth.cookie;
      }
    }

    const response = await fetch(fetchUrl, { headers });
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();
    res.setHeader('Content-Type', contentType);
    return res.status(response.status).send(text);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}
