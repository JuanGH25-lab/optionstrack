// ── Hôtes autorisés ──────────────────────────────────────────────────────
// IBKR (Flex Query — données PERSONNELLES, jamais mises en cache) : le chemin
// exact varie selon le compte (ndcdyn/gdcdyn, V3/legacy, URL renvoyée par
// IBKR lui-même pour GetStatement) — on ne restreint donc que l'hôte, pas le
// chemin, pour ce groupe.
const IB_HOSTS = [
  'gdcdyn.interactivebrokers.com',
  'ndcdyn.interactivebrokers.com',
  'interactivebrokers.com', // repli générique (suffixe) si IBKR introduit un autre sous-domaine
];
// Yahoo Finance (cours — données PUBLIQUES, partageables entre tous les membres).
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
// Seul chemin Yahoo réellement appelé par index.html (fetchYahooQuote) :
// https://queryN.finance.yahoo.com/v8/finance/chart/<symbole>
const YAHOO_PATH_PREFIX = '/v8/finance/chart/';

// Origines front autorisées à utiliser ce proxy. Vérification LÉGÈRE (pas une
// authentification) : un script tiers qui forge son Origin/Referer la
// contourne, mais elle bloque déjà l'intégration naïve depuis une autre page
// et l'appel direct au hasard d'une URL devinée.
const ALLOWED_ORIGIN_HOSTS = ['www.olt-tracker.app', 'optionstrack.vercel.app'];

function hostnameOf(value) {
  try { return new URL(value).hostname; } catch { return null; }
}

// true = origine reconnue ou absente (voir commentaire d'appel) ; false = à rejeter.
function originIsAllowed(req) {
  const origin = req.headers['origin'];
  if (origin) return ALLOWED_ORIGIN_HOSTS.includes(hostnameOf(origin));
  const referer = req.headers['referer'] || req.headers['referrer'];
  if (referer) return ALLOWED_ORIGIN_HOSTS.includes(hostnameOf(referer));
  // Ni Origin ni Referer (navigation directe, certains contextes de confidentialité
  // stricte) : on laisse passer plutôt que de risquer de casser un usage légitime —
  // c'est le compromis d'une vérification "légère" sans vraie authentification.
  return true;
}

// ── Heures de marché PAR TICKER — Yahoo renvoie, pour chaque symbole, les horaires de SA
// propre place de cotation dans meta.currentTradingPeriod.regular ({start,end}, epoch
// secondes). On s'appuie directement dessus plutôt que sur un calendrier US codé en dur :
// un .PA (Paris), .L (Londres), .HK (Hong Kong), .TO (Toronto) ou .SW (Suisse) a sa PROPRE
// séance, souvent décalée de plusieurs heures par rapport au marché US — un calendrier US
// unique mettait en cache un titre étranger pendant SA séance à lui (bug signalé : un .PA se
// faisait cacher 30 min alors que Paris était ouvert).
function quoteCacheSeconds(text, now) {
  try {
    const data = JSON.parse(text);
    const period = data?.chart?.result?.[0]?.meta?.currentTradingPeriod?.regular;
    if (!period || typeof period.start !== 'number' || typeof period.end !== 'number') {
      return 15; // meta absent/illisible : repli prudent, fraîcheur maximale
    }
    const nowSec = now.getTime() / 1000;
    if (nowSec >= period.start && nowSec < period.end) return 15;       // séance de CE titre ouverte
    if (period.start > nowSec) return Math.max(15, Math.min(1800, Math.round(period.start - nowSec))); // ouverture future connue
    return 300; // séance terminée, prochaine ouverture non fournie par cette réponse
  } catch {
    return 15; // JSON illisible : repli prudent
  }
}

module.exports = async function handler(req, res) {
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

  if (!originIsAllowed(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const isIB = IB_HOSTS.some(h => target.hostname.endsWith(h));
  const isYahoo = YAHOO_HOSTS.includes(target.hostname);

  if (!isIB && !isYahoo) {
    return res.status(403).json({ error: 'Host not allowed' });
  }
  if (isYahoo && !target.pathname.startsWith(YAHOO_PATH_PREFIX)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/xml,application/xml,*/*',
      },
    });

    const text = await upstream.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain');
    // On ne relaie JAMAIS les en-têtes renvoyés par l'amont (Set-Cookie, Vary, Cache-Control
    // Yahoo...) — seuls Content-Type et NOS propres en-têtes de cache sont transmis ci-dessous.

    // ── Cache CDN partagé — Yahoo EN SUCCÈS (200) UNIQUEMENT ; jamais sur une erreur/4xx/5xx,
    // et jamais pour IBKR (la réponse contient le token + les positions personnelles du
    // membre). Deux en-têtes distincts : Vercel-CDN-Cache-Control pilote UNIQUEMENT le CDN
    // Vercel (mutualisé entre tous les membres) ; Cache-Control: no-store interdit au
    // NAVIGATEUR de chacun de réutiliser une réponse locale — chaque F5/retour sur la page
    // repasse donc bien par Vercel, qui lui peut servir depuis son cache partagé.
    if (isYahoo && upstream.status === 200) {
      // Paires FX (ex. EURUSD=X) : pas de "séance" à proprement parler côté Yahoo pour ces
      // symboles — cache fixe en permanence, peu importe l'heure.
      const isFx = target.pathname.endsWith('=X');
      // Pas de stale-while-revalidate ici : un stale aurait pu resservir un cours de plus de
      // 15s pendant la revalidation, en contradiction avec la garantie de fraîcheur en séance.
      const sMaxAge = isFx ? 300 : quoteCacheSeconds(text, new Date());
      res.setHeader('Vercel-CDN-Cache-Control', `s-maxage=${sMaxAge}`);
    }
    // Navigateur : jamais de cache local, quel que soit l'hôte ou le statut.
    res.setHeader('Cache-Control', 'no-store');

    res.status(upstream.status).send(text);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
};
