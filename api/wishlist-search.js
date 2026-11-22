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
    const discover = body?.mode === 'discover';
    const search = async (engine, q) => {
      const params = new URLSearchParams({ engine, q, google_domain: 'google.com.br', gl: 'br', hl: 'pt-br', api_key: apiKey, ...(!discover ? { tbs: 'qdr:m3' } : {}) });
      const response = await fetch('https://serpapi.com/search.json?' + params.toString(), {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000), cache: 'no-store'
      });
      if (!response.ok) throw new Error('SEARCH_PROVIDER_' + response.status);
      return response.json();
    };
    const searchQuery = discover ? query : query + ' 220V';
    const shopping = await search('google_shopping', searchQuery);
    let rows = Array.isArray(shopping.shopping_results) ? shopping.shopping_results : [];
    let source = 'GOOGLE SHOPPING';
    // A descoberta aceita resultados mais amplos e páginas de produto sem preço.
    if (discover && rows.length < 4) {
      try {
        const general = await search('google', searchQuery);
        const organic = Array.isArray(general.organic_results) ? general.organic_results : [];
        const seen = new Set(rows.map(x => x.link).filter(Boolean));
        for (const item of organic) {
          if (!item.title || !item.link || seen.has(item.link)) continue;
          rows.push({ title: item.title, link: item.link, snippet: item.snippet || '',
            thumbnail: item.thumbnail || '', source: item.source || item.displayed_link || 'RESULTADO DA WEB' });
          seen.add(item.link);
        }
        if (organic.length) source = 'GOOGLE SHOPPING + RESULTADOS DA WEB';
      } catch (fallbackError) { console.warn('fallback search unavailable', fallbackError); }
    }
    const products = rows.map(row => {
      const rawPrice = String(row.extracted_price ?? row.price ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
      const priceValue = Number(rawPrice);
      const title = String(row.title || '').slice(0, 300);
      const description = String(row.snippet || row.description || '').slice(0, 700);
      const evidence = [title, description].filter(Boolean).join(' ');
      let voltageStatus = 'UNKNOWN';
      if (/\b(110|127)\s?V\b|\b(110|127)\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'INCOMPATIBLE';
      else if (/\bBIVOLT\b|\b100\s?A\s?240\s?V\b/i.test(evidence)) voltageStatus = 'BIVOLT';
      else if (/\b220\s?V\b|\b220\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'CONFIRMED_220V';
      return {
        title, description,
        source: String(row.source || row.seller || 'GOOGLE SHOPPING').slice(0, 100),
        link: typeof row.link === 'string' && /^https:\/\/(?!localhost)/i.test(row.link) ? row.link : '',
        thumbnail: typeof (row.thumbnail || row.thumbnail_url) === 'string' && /^https:\/\//i.test(row.thumbnail || row.thumbnail_url) ? (row.thumbnail || row.thumbnail_url) : '',
        priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
        priceText: String(row.price || '').slice(0, 60),
        rating: row.rating ?? null, reviews: row.reviews ?? null,
        voltageStatus, voltageConfirmed: voltageStatus === 'CONFIRMED_220V' || voltageStatus === 'BIVOLT'
      };
    }).filter(p => p.title && (discover || (p.priceValue && p.link)));
    return json({
      searchId: new Date().toISOString(), query, products,
      ignoredForVoltage: products.filter(p => p.voltageStatus === 'UNKNOWN' || p.voltageStatus === 'INCOMPATIBLE').length,
      source
    });
  } catch (error) {
    console.error('wishlist search failed', error);
    return json({ error: 'NÃO FOI POSSÍVEL CONSULTAR AS FONTES AGORA.' }, 502);
  }
}
