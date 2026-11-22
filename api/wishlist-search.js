const SUPABASE_URL = 'https://gjotzkvhvdqhnaoxcgxv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MIgd-yrCkY1_JZln8pZQNw_AE3sog86';
const ALLOWED_USER_ID = 'b163037a-b543-42a8-a6a5-eeee31291898';
const ALLOWED_EMAIL = 'cosmosconfeitaria@gmail.com';
const COOKIE_NAME = 'cosmos_access_token';

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const part = raw.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + '='));
  return part ? decodeURIComponent(part.slice(COOKIE_NAME.length + 1)) : '';
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try { return !!host && new URL(origin).host === host; } catch (_) { return false; }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' }
  });
}
export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'ORIGEM NÃO AUTORIZADA.' }, 403);
  const token = readCookie(request);
  if (!token || token.length > 8192) return json({ error: 'SESSÃO EXPIRADA. ENTRE NOVAMENTE.' }, 401);
  try {
    const verify = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token },
      cache: 'no-store'
    });
    if (!verify.ok) return json({ error: 'SESSÃO INVÁLIDA.' }, 401);
    const user = await verify.json();
    if (user.id !== ALLOWED_USER_ID || String(user.email || '').toLowerCase() !== ALLOWED_EMAIL) {
      return json({ error: 'ACESSO NÃO AUTORIZADO.' }, 403);
    }
    const body = await request.json();
    const query = String(body?.query || '').trim().slice(0, 240);
    if (!query) return json({ error: 'INFORME O MODELO PARA BUSCAR.' }, 400);
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) return json({
      error: 'A BUSCA AUTOMÁTICA AINDA PRECISA DA CHAVE SERPAPI_API_KEY NAS VARIÁVEIS DE AMBIENTE DA VERCEL. NENHUM PREÇO FOI INVENTADO OU SALVO.'
    }, 503);
    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: query + ' 220V',
      google_domain: 'google.com.br',
      gl: 'br',
      hl: 'pt-br',
      api_key: apiKey
    });
    const upstream = await fetch('https://serpapi.com/search.json?' + params.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store'
    });
    if (!upstream.ok) return json({ error: 'O SERVIÇO DE BUSCA RETORNOU ' + upstream.status + '. TENTE NOVAMENTE MAIS TARDE.' }, 502);
    const payload = await upstream.json();
    const rows = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
    const products = rows.map(row => {
      const rawPrice = String(row.extracted_price ?? row.price ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
      const priceValue = Number(rawPrice);
      const title = String(row.title || '').slice(0, 300);
      const voltageConfirmed = /\b220\s?V\b|\b220\s?VOLTS?\b/i.test(title);
      return {
        title,
        source: String(row.source || row.seller || 'GOOGLE SHOPPING').slice(0, 100),
        link: typeof row.link === 'string' && /^https:\/\/(?!localhost)/i.test(row.link) ? row.link : '',
        thumbnail: typeof row.thumbnail === 'string' && /^https:\/\//i.test(row.thumbnail) ? row.thumbnail : '',
        priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
        priceText: String(row.price || '').slice(0, 60),
        rating: row.rating ?? null,
        reviews: row.reviews ?? null,
        voltageConfirmed
      };
    }).filter(p => p.title && p.priceValue && p.link);
    const confirmed = products.filter(p => p.voltageConfirmed);
    return json({
      searchId: new Date().toISOString(),
      query,
      products: confirmed,
      ignoredForVoltage: products.length - confirmed.length,
      source: 'GOOGLE SHOPPING VIA SERPAPI'
    });
  } catch (error) {
    console.error('wishlist search failed', error);
    return json({ error: 'NÃO FOI POSSÍVEL CONSULTAR AS FONTES AGORA.' }, 502);
  }
}
