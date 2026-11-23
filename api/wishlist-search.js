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
function normalizeCapacity(value) { const m=String(value||'').toUpperCase().replace(',','.').match(/[0-9]+(?:\.[0-9]+)?/); return m ? Number(m[0]).toString().replace(/\.0$/,'')+'L' : ''; }
function parseDisplayedPrice(row) {
  const text=[row.price,row.price_text,row.installment,row.installments,row.installment_plan].filter(v=>v!=null&&v!=='').join(' · ');
  const matches=[...text.matchAll(/R\$\s*([\d.]+,\d{2}|[\d,]+\.\d{2})/gi)];
  const parse=v=>Number(String(v).replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
  const installmentMatch=text.match(/\b(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.,]+)/i);
  const installmentAmount=installmentMatch?parse(installmentMatch[2]):null;
  const installmentCount=installmentMatch?Number(installmentMatch[1]):null;
  const installmentTotal=installmentAmount&&installmentCount?installmentAmount*installmentCount:null;
  const installmentText=installmentMatch?(text.slice(installmentMatch.index,Math.min(text.length,installmentMatch.index+90)).match(/^\d{1,2}\s*x\s*(?:de\s*)?R\$\s*[\d.,]+(?:\s*(?:sem\s*juros|com\s*juros))?/i)||[])[0]||installmentMatch[0]:'';
  const isInstallment=m=>/\b\d{1,2}\s*x\s*(?:de\s*)?R\$\s*$/i.test(text.slice(Math.max(0,m.index-24),m.index));
  const valid=matches.filter(m=>!isInstallment(m));
  const context=m=>text.slice(Math.max(0,m.index-48),Math.min(text.length,m.index+64));
  const paymentContext=m=>{const before=text.slice(Math.max(0,m.index-36),m.index),next=text.indexOf('R'+'$',m.index+2),after=text.slice(m.index,next>=0?next:Math.min(text.length,m.index+60));return before+' '+after};
  const creditMatch=valid.find(m=>/cart[aã]o|cr[eé]dito|parcelad[oa]/i.test(paymentContext(m))&&!/\d{1,2}\s*x/i.test(paymentContext(m)));
  const cashMatch=valid.find(m=>/à\s?vista|no\s*pix|pix|boleto|dinheiro/i.test(paymentContext(m)));
  const numericFallback=(!matches.length&&!installmentMatch)?Number(row.extracted_price??row.price_value??row.price??0):null;
  const cashPrice=cashMatch?parse(cashMatch[1]):null;
  const creditPrice=Number.isFinite(installmentTotal)&&installmentTotal>0?installmentTotal:(creditMatch?parse(creditMatch[1]):null);
  const genericMatch=!cashPrice?valid.find(m=>m!==creditMatch&&(!installmentAmount||Math.abs(parse(m[1])-installmentAmount)>=0.01)):null;
  const productPrice=genericMatch?parse(genericMatch[1]):(!cashPrice&&!creditPrice&&Number.isFinite(numericFallback)&&numericFallback>0?numericFallback:null);
  const priceValue=cashPrice||creditPrice||productPrice||null;
  const priceText=[
    cashPrice?'À VISTA '+cashPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    creditPrice?'TOTAL PARCELADO '+creditPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    productPrice?'PREÇO ANUNCIADO '+productPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    installmentAmount&&installmentCount?'PARCELA '+installmentCount+'X DE '+installmentAmount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+(/sem\s*juros/i.test(installmentText)?' SEM JUROS':/com\s*juros/i.test(installmentText)?' COM JUROS':''):''
  ].filter(Boolean).join(' · ');
  return {cashPrice,creditPrice,productPrice,installmentAmount,installmentCount,installmentPlan:installmentText,priceValue,priceText};
}
function directStoreUrl(value) { try { const url=new URL(String(value||'')); return url.protocol==='https:'&&!/(^|\.)google\./i.test(url.hostname)&&!url.hostname.endsWith('serpapi.com')?url.toString():''; } catch (_) { return ''; } }
function extractModel(value) { return (String(value || '').match(/\b[A-Z]{2,10}[-]?\d{2,5}[A-Z]{0,4}(?:\s+(?:PLUS|PRO|MAX|PREMIUM|DIGITAL|ELETRÔNICA|ELETRONICA))?\b/i) || [])[0] || ''; }
function technicalData(row) {
  const title = String(row.title || '').slice(0, 300);
  const description = String(row.snippet || row.description || row.product_description || '').slice(0, 900);
  const features = [plainText(row.extensions), plainText(row.product_highlights), plainText(row.snippets), plainText(row.attributes)].filter(Boolean).join(' · ');
  const evidence = [title, description, features].filter(Boolean).join(' ');
  const model = extractModel(evidence);
  const capacityMatch = evidence.match(/\b\d+(?:[,.]\d+)?\s?(?:L|LITROS?)\b/i);
  const capacity = capacityMatch ? normalizeCapacity(capacityMatch[0]) : '';
  const power = (evidence.match(/\b\d{2,4}\s?W\b/i) || [])[0] || '';
  const warranty = (evidence.match(/garantia[^.\n]{0,45}\b\d+\s*(?:mes(?:es)?|anos?)\b/i) || [])[0] || '';
  const ratingRaw = row.rating ?? row.rating_value ?? row.product_rating ?? '';
  const ratingNumber = Number(String(ratingRaw).replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || '');
  const rating = Number.isFinite(ratingNumber) && ratingNumber > 0 ? ratingNumber : null;
  const ratingCount = row.reviews ?? row.reviews_count ?? row.rating_count ?? '';
  let voltageStatus = 'UNKNOWN';
  if (/\b(110|127)\s?V\b|\b(110|127)\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'INCOMPATIBLE';
  else if (/\bBIVOLT\b|\b100\s?A\s?240\s?V\b/i.test(evidence)) voltageStatus = 'BIVOLT';
  else if (/\b220\s?V\b|\b220\s?VOLTS?\b/i.test(evidence)) voltageStatus = 'CONFIRMED_220V';
  const parsedPrice = parseDisplayedPrice(row);
  const priceValue = parsedPrice.priceValue;
  return {
    title, description, source: String(row.source || row.seller || 'LOJA').slice(0, 100),
    link: directStoreUrl(row.link) || directStoreUrl(row.product_link),
    productId: String(row.product_id || ''),
    thumbnail: typeof (row.thumbnail || row.thumbnail_url || row.thumbnail_link) === 'string' && /^https:\/\//i.test(row.thumbnail || row.thumbnail_url || row.thumbnail_link) ? (row.thumbnail || row.thumbnail_url || row.thumbnail_link) : '',
    priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
    cashPrice: Number.isFinite(parsedPrice.cashPrice) && parsedPrice.cashPrice > 0 ? parsedPrice.cashPrice : null,
    creditPrice: Number.isFinite(parsedPrice.creditPrice) && parsedPrice.creditPrice > 0 ? parsedPrice.creditPrice : null,
    productPrice: Number.isFinite(parsedPrice.productPrice) && parsedPrice.productPrice > 0 ? parsedPrice.productPrice : null,
    installmentPlan: parsedPrice.installmentPlan,
    installmentAmount: parsedPrice.installmentAmount,
    installmentCount: parsedPrice.installmentCount,
    priceText: parsedPrice.priceText,
    rating, ratingCount: ratingCount ? String(ratingCount) : '',
    model, capacity, power, warranty,
    brand: String(row.brand || '').slice(0, 100),
    specs: features.slice(0, 1200),
    dimensions: String(row.dimensions || row.product_dimensions || ((evidence.match(/\b\d{2,3}(?:[,.]\d+)?\s*[x×]\s*\d{2,3}(?:[,.]\d+)?\s*[x×]\s*\d{2,3}(?:[,.]\d+)?\s*(?:cm|mm)\b/i)||[])[0]) || '').slice(0, 160),
    priceDate: String(row.price_date || row.valid_from || row.offer_date || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || null,
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
    const requestedCapacity = normalizeCapacity(body?.capacity || ((query.match(/\b\d+(?:[,.]\d+)?\s?(?:L|LITROS?)\b/i) || [])[0] || ''));
    const exactModelMatch = product => !requestedModelKey || normalizeModel(product.model) === requestedModelKey;
    const exactCapacityMatch = product => !requestedCapacity || (!!product.capacity && normalizeCapacity(product.capacity) === requestedCapacity);
    const search = async (engine, q) => {
      const params = new URLSearchParams({ engine, q, google_domain: 'google.com.br', gl: 'br', hl: 'pt-br', api_key: apiKey });
      const response = await fetch('https://serpapi.com/search.json?' + params.toString(), {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), cache: 'no-store'
      });
      if (!response.ok) throw new Error('SEARCH_PROVIDER_' + response.status);
      return response.json();
    };
    const productLookup = async productId => {
      const params = new URLSearchParams({ engine: 'google_product', product_id: String(productId), offer_view: 'true', gl: 'br', hl: 'pt-br', api_key: apiKey });
      const response = await fetch('https://serpapi.com/search.json?' + params.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), cache: 'no-store' });
      if (!response.ok) throw new Error('PRODUCT_LOOKUP_' + response.status);
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
    const rawProducts = rows.map(technicalData).filter(p => p.title && exactModelMatch(p) && exactCapacityMatch(p));
    const products = await Promise.all(rawProducts.slice(0, 10).map(async base => {
      if (!base.productId) return base;
      try {
        const productResponse = await productLookup(base.productId);
        const product = productResponse.product_results || {};
        const attributes = product.product_attributes || [];
        const description = [product.about_the_product?.description, plainText(product.about_the_product?.features), plainText(attributes), base.description].filter(Boolean).join(' · ');
        const dimensions = attributes.filter(attribute => /^(height|width|depth|dimensions?)$/i.test(String(attribute.name || ''))).map(attribute => String(attribute.value || '').trim()).filter(Boolean).join(' × ');
        const merged = technicalData({ ...base, title: product.title || base.title, brand: product.brand || base.brand, rating: product.rating ?? base.rating, reviews: product.reviews ?? base.ratingCount, snippet: description, attributes, dimensions });
        const offers = (Array.isArray(product.stores) ? product.stores : []).map(store => {
          const link = directStoreUrl(store.link);
          const parsedOfferPrice = parseDisplayedPrice(store);
          const priceValue = parsedOfferPrice.priceValue;
          const offerTech = technicalData({ title: [product.title, store.title].filter(Boolean).join(' '), snippet: description, brand: product.brand || base.brand, rating: product.rating ?? base.rating, reviews: product.reviews ?? base.ratingCount, attributes });
          const model = offerTech.model || merged.model || base.model;
          const capacity = offerTech.capacity || merged.capacity || base.capacity;
          const voltageStatus = offerTech.voltageStatus !== 'UNKNOWN' ? offerTech.voltageStatus : merged.voltageStatus;
          return { store: String(store.name || base.source || 'LOJA'), title: String(store.title || product.title || base.title), priceValue: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null, cashPrice: parsedOfferPrice.cashPrice, creditPrice: parsedOfferPrice.creditPrice, productPrice: parsedOfferPrice.productPrice, installmentPlan: parsedOfferPrice.installmentPlan, installmentAmount: parsedOfferPrice.installmentAmount, installmentCount: parsedOfferPrice.installmentCount, installmentAmount: parsedOfferPrice.installmentAmount, installmentCount: parsedOfferPrice.installmentCount, shipping: Number(store.shipping_extracted || 0) || 0, link, thumbnail: base.thumbnail, model, capacity, power: offerTech.power || merged.power || base.power, warranty: offerTech.warranty || merged.warranty || base.warranty, rating: merged.rating, ratingCount: merged.ratingCount, dimensions: merged.dimensions, voltageStatus, voltageConfirmed: voltageStatus === 'CONFIRMED_220V' || voltageStatus === 'BIVOLT' };
        }).filter(offer => offer.link && offer.priceValue && offer.voltageConfirmed && (!requestedModelKey || normalizeModel(offer.model) === requestedModelKey) && (!requestedCapacity || (!!offer.capacity && normalizeCapacity(offer.capacity) === requestedCapacity)));
        const bestOffer = offers.slice().sort((a,b)=>(a.priceValue+a.shipping)-(b.priceValue+b.shipping))[0];
        const priceInsights = product.price_insights || {};
        const history = [];
        if (String(priceInsights.currency || '').toUpperCase() === 'BRL') {
          for (const storeHistory of (priceInsights.stores || [])) {
            const offer = offers.find(o => normalizeModel(o.store) === normalizeModel(storeHistory.name) || normalizeModel(o.store).includes(normalizeModel(storeHistory.name)) || normalizeModel(storeHistory.name).includes(normalizeModel(o.store)));
            if (!offer) continue;
            for (const point of (storeHistory.prices || [])) {
              const parsed = new Date(point.date);
              const price = Number(point.price);
              if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(price) || price <= 0) continue;
              history.push({ store: offer.store, price, priceType:'FULL_PRODUCT_PRICE', priceDate: parsed.toISOString().slice(0,10), url: offer.link, shipping: 0, voltageStatus: offer.voltageStatus, title: offer.title });
            }
          }
        }
        return { ...merged, link: bestOffer?.link || base.link, source: bestOffer?.store || base.source, priceValue: bestOffer?.priceValue || base.priceValue, cashPrice: bestOffer?.cashPrice ?? base.cashPrice, creditPrice: bestOffer?.creditPrice ?? base.creditPrice, installmentAmount: bestOffer?.installmentAmount ?? base.installmentAmount, installmentCount: bestOffer?.installmentCount ?? base.installmentCount, installmentPlan: bestOffer?.installmentPlan || base.installmentPlan, priceValue: bestOffer?.priceValue ?? base.priceValue, priceText: bestOffer ? [bestOffer.cashPrice?'À VISTA '+Number(bestOffer.cashPrice).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',bestOffer.creditPrice?'TOTAL PARCELADO '+Number(bestOffer.creditPrice).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',bestOffer.installmentAmount&&bestOffer.installmentCount?'PARCELA '+bestOffer.installmentCount+'X DE '+Number(bestOffer.installmentAmount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''].filter(Boolean).join(' · ') : base.priceText, voltageStatus: bestOffer?.voltageStatus || merged.voltageStatus, voltageConfirmed: bestOffer?.voltageConfirmed || merged.voltageConfirmed, offers, priceHistory: history };
      } catch (lookupError) { console.warn('google product enrichment unavailable', base.title, lookupError); return base; }
    }));
    const filteredProducts = products.filter(p => p.title && exactModelMatch(p) && exactCapacityMatch(p) && (discover || (p.priceValue && p.link)));
    return json({
      searchId: new Date().toISOString(), query, products: filteredProducts,
      ignoredForVoltage: rows.length - filteredProducts.length,
      searchWindow: discover ? null : 'CURRENT_OFFERS', requestedModel,
      source
    });
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
