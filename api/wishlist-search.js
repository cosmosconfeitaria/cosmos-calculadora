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
function plainText(value) {
  if (Array.isArray(value)) return value.map(plainText).join(' · ');
  if (value && typeof value === 'object') return Object.values(value).map(plainText).join(' · ');
  return String(value || '');
}
function normalizeModel(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function extractModel(value) { return (String(value || '').match(/\b[A-Z]{2,10}[-]?\d{2,5}[A-Z]{0,4}(?:\s+(?:PLUS|PRO|MAX|PREMIUM|DIGITAL|ELETRÔNICA|ELETRONICA))?\b/i) || [])[0] || ''; }
function technicalData(row) {
  const title = String(row.title || '').slice(0, 300);
  const description = String(row.snippet || row.description || row.product_description || '').slice(0, 900);
  const features = [plainText(row.extensions), plainText(row.product_highlights), plainText(row.snippets), plainText(row.attributes)].filter(Boolean).join(' · ');
  const evidence = [title, description, features].filter(Boolean).join(' ');
  const model = extractModel(evidence);
  const capacity = (evidence.match(/\b\d+(?:[,.]\d+)?\s?L\b/i) || [])[0] || '';
  const power = (evidence.match(/\b\d{2,4}\s?W\b/i) || [])[0] || '';
  const warranty = (evidence.match(/garantia[^.\n]{0,45}\b\d+\s*(?:mes(?:es)?|anos?)\b/i) || [])[0] || '';
  const rating = row.rating ?? row.rating_value ?? '';
  const reviews = row.reviews ?? row.reviews_count ?? row.rating_count ?? '';
  let voltageStatus = 'UNKNOWN';
  if (/\b(110|127)\s?V\b|\b(110|127)\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'INCOMPATIBLE';
  else if (/\bBIVOLT\b|\b100\s?A\s?240\s?V\b/i.test(evidence)) voltageStatus = 'BIVOLT';
  else if (/\b220\s?V\b|\b220\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'CONFIRMED_220V';
  const rawPrice = String(row.extracted_price ?? row.price ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const priceValue = Number(rawPrice);
  return {
    title, description, source: String(row.source || row.seller || 'LOJA').slice(0, 100),
    link: typeof (row.link || row.product_link) === 'string' && /^https:\/\/(?!localhost)/i.test(row.link || row.product_link) ? (row.link || row.product_link) : '',
    thumbnail: typeof (row.thumbnail || row.thumbnail_url || row.thumbnail_link) === 'string' && /^https:\/\//i.test(row.thumbnail || row.thumbnail_url || row.thumbnail_link) ? (row.thumbnail || row.thumbnail_url || row.thumbnail_link) : '',
    priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
    priceText: String(row.price || '').slice(0, 60),
    rating, reviews: reviews ? String(reviews) : (rating ? String(rating) : ''),
    model, capacity, power, warranty,
    brand: String(row.brand || '').slice(0, 100),
    specs: features.slice(0, 1200),
    voltageStatus, voltageConfirmed: voltageStatus === 'CONFIRMED_220V' || voltageStatus === 'BIVOLT'
  };
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
      error: 'A BUSCA AUTOMÁTICA PRECISA DA CHAVE SERPAPI_API_KEY NAS VARIÁVEIS DE AMBIENTE DA VERCEL. NENHUM PREÇO FOI INVENTADO OU SALVO.'
    }, 503);
    const discover = body?.mode === 'discover';
    const requestedModel = String(body?.model || extractModel(query) || '').trim();
    const requestedModelKey = normalizeModel(requestedModel);
    const requestedCapacity = String(body?.capacity || ((query.match(/\b\d+(?:[,.]\d+)?\s?L\b/i) || [])[0] || '')).replace(/\s/g, '').replace(',', '.').toUpperCase();
    const exactModelMatch = product => !requestedModelKey || normalizeModel(product.model) === requestedModelKey;
    const exactCapacityMatch = product => !requestedCapacity || !product.capacity || product.capacity.replace(/\s/g, '').replace(',', '.').toUpperCase() === requestedCapacity;
    const search = async (engine, q) => {
      const params = new URLSearchParams({ engine, q, google_domain: 'google.com.br', gl: 'br', hl: 'pt-br', api_key: apiKey });
      const response = await fetch('https://serpapi.com/search.json?' + params.toString(), {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), cache: 'no-store'
      });
      if (!response.ok) throw new Error('SEARCH_PROVIDER_' + response.status);
      return response.json();
    };
    const searchBase = requestedModel ? '"' + requestedModel + '" ' + query.replace(requestedModel, '').trim() : '"' + query + '"';
    const queries = [searchBase + ' 220V', searchBase + ' BIVOLT'];
    const rows = [], seen = new Set();
    let source = 'RESULTADOS DE PRODUTOS';
    for (const term of queries) {
      const shopping = await search('google_shopping', term);
      for (const row of (Array.isArray(shopping.shopping_results) ? shopping.shopping_results : [])) {
        const link = row.link || row.product_link || '';
        const key = link || String(row.title || '').toLowerCase();
        if (key && !seen.has(key)) { seen.add(key); rows.push(row); }
      }
      if (discover && rows.length >= 8) break;
      if (!discover && rows.some(row => {
        const p = technicalData(row);
        return p.priceValue && p.link && p.voltageConfirmed && exactModelMatch(p) && exactCapacityMatch(p);
      })) break;
    }
    if (rows.length < (discover ? 4 : 3)) {
      try {
        const general = await search('google', searchBase + (discover ? '' : ' 220V OR BIVOLT'));
        for (const item of (Array.isArray(general.organic_results) ? general.organic_results : [])) {
          if (!item.title || !item.link || seen.has(item.link)) continue;
          rows.push({ title: item.title, link: item.link, snippet: item.snippet || '', thumbnail: item.thumbnail || '', source: item.source || item.displayed_link || 'RESULTADO DA WEB' });
          seen.add(item.link);
        }
        if (rows.length) source = 'RESULTADOS DE PRODUTOS E LOJAS';
      } catch (fallbackError) { console.warn('fallback search unavailable', fallbackError); }
    }
    const products = rows.map(technicalData).filter(p => p.title && exactModelMatch(p) && exactCapacityMatch(p) && (discover || (p.priceValue && p.link)));
    return json({
      searchId: new Date().toISOString(), query, products,
      ignoredForVoltage: rows.length - products.length,
      searchWindow: discover ? null : 'CURRENT_OFFERS', requestedModel,
      source
    });
  } catch (error) {
    console.error('wishlist search failed', error);
    return json({ error: 'NÃO FOI POSSÍVEL CONSULTAR AS FONTES AGORA. TENTE NOVAMENTE EM INSTANTES.' }, 502);
  }
}
