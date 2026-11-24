const SUPABASE_URL = 'https://gjotzkvhvdqhnaoxcgxv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MIgd-yrCkY1_JZln8pZQNw_AE3sog86';
const ALLOWED_USER_ID = 'b163037a-b543-42a8-a6a5-eeee31291898';
const ALLOWED_EMAIL = 'cosmosconfeitaria@gmail.com';
const COOKIE_NAME = 'cosmos_access_token';
const ALLOWED_HOSTS = [
 'amazon.com.br','www.amazon.com.br','mercadolivre.com.br','www.mercadolivre.com.br','stockup.com.br','www.stockup.com.br',
 'magazineluiza.com.br','www.magazineluiza.com.br','kabum.com.br','www.kabum.com.br',
 'casasbahia.com.br','www.casasbahia.com.br','fastshop.com.br','www.fastshop.com.br',
 'zoom.com.br','www.zoom.com.br','buscape.com.br','www.buscape.com.br',
 'kitchenaid.com.br','www.kitchenaid.com.br','brastemp.com.br','www.brastemp.com.br',
 'electrolux.com.br','www.electrolux.com.br','philips.com.br','www.philips.com.br'
];
function sameOrigin(request){const origin=request.headers.get('origin');if(!origin)return true;const host=request.headers.get('x-forwarded-host')||request.headers.get('host');try{return !!host&&new URL(origin).host===host}catch(_){return false}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
function cookie(request){const p=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+'='));return p?decodeURIComponent(p.slice(COOKIE_NAME.length+1)):''}
function clean(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}
function moneyValue(value){if(value==null||value==='')return null;const raw=String(value).replace(/[^0-9,.-]/g,'');const normalized=raw.includes(',')?raw.replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'):raw;const n=Number(normalized);return Number.isFinite(n)&&n>0?n:null}
function meta(html,key){for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){const attrs={};for(const m of tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=m[2];if((attrs.property||attrs.name)===key)return clean(attrs.content)}return ''}
function findProductJson(value,out=[]){if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const v of value)findProductJson(v,out);return out}const type=value['@type'];if(type==='Product'||(Array.isArray(type)&&type.includes('Product')))out.push(value);for(const v of Object.values(value))if(v&&typeof v==='object')findProductJson(v,out);return out}
export async function POST(request){
 if(!sameOrigin(request))return json({error:'ORIGEM NÃO AUTORIZADA.'},403);
 const token=cookie(request);if(!token)return json({error:'SESSÃO EXPIRADA. ENTRE NOVAMENTE.'},401);
 try{
  const auth=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token},cache:'no-store'});
  if(!auth.ok)return json({error:'SESSÃO INVÁLIDA.'},401);const user=await auth.json();
  if(user.id!==ALLOWED_USER_ID||String(user.email||'').toLowerCase()!==ALLOWED_EMAIL)return json({error:'ACESSO NÃO AUTORIZADO.'},403);
  const body=await request.json(),raw=String(body?.url||'').trim();let url;
  try{url=new URL(raw)}catch(_){return json({error:'LINK INVÁLIDO.'},400)}
  if(url.protocol!=='https:'||!ALLOWED_HOSTS.includes(url.hostname.toLowerCase()))return json({error:'POR SEGURANÇA, A LEITURA AUTOMÁTICA ESTÁ LIMITADA A LOJAS E COMPARADORES CONHECIDOS.'},400);
  const upstream=await fetch(url.toString(),{headers:{'User-Agent':'Mozilla/5.0 (compatible; CosmosWishlist/1.0)','Accept':'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!upstream.ok)return json({error:'A LOJA NÃO PERMITIU A LEITURA AUTOMÁTICA DESTA PÁGINA.'},502);
  const finalUrl=new URL(upstream.url);if(finalUrl.protocol!=='https:'||!ALLOWED_HOSTS.includes(finalUrl.hostname.toLowerCase()))return json({error:'REDIRECIONAMENTO EXTERNO BLOQUEADO.'},400);
  const html=(await upstream.text()).slice(0,1800000);
  let product={};for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const data=JSON.parse(m[1]);const found=findProductJson(data);if(found.length){product=found[0];break}}catch(_){}}
  const offers=Array.isArray(product.offers)?product.offers[0]:(product.offers||{});
  const brand=typeof product.brand==='string'?product.brand:product.brand?.name||'';
  const image=Array.isArray(product.image)?product.image[0]:typeof product.image==='object'?product.image.url:product.image;
  const pageText=clean(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' '));
  const moneyMatches=[...pageText.matchAll(/R\$\s*([\d.]+,\d{2}|[\d,]+\.\d{2})/gi)];
  const parseMoney=value=>moneyValue(value);
   const installmentMatch=pageText.match(/\b(\d{1,2})\s*(?:x|vezes|parcelas?)\s*(?:de\s*)?(?:R\$\s*)?([\d.]+,\d{2}|[\d,]+\.\d{2})/i);
  const installmentAmount=installmentMatch?parseMoney(installmentMatch[2]):null;
  const installmentCount=installmentMatch?Number(installmentMatch[1]):null;
  const installmentTotal=installmentAmount&&installmentCount?installmentAmount*installmentCount:null;
   const installmentPlan=installmentMatch?(pageText.slice(installmentMatch.index,installmentMatch.index+110).match(/^\d{1,2}\s*(?:x|vezes|parcelas?)\s*(?:de\s*)?(?:R\$\s*)?[\d.,]+(?:\s*(?:sem\s*juros|com\s*juros))?/i)||[])[0]||installmentMatch[0]:'';
   const isInstallment=m=>/\b\d{1,2}\s*(?:x|vezes|parcelas?)\s*(?:de\s*)?(?:R\$\s*)?$/i.test(pageText.slice(Math.max(0,m.index-55),m.index));
  const validMoney=moneyMatches.filter(m=>!isInstallment(m));
  const paymentContext=m=>{const before=pageText.slice(Math.max(0,m.index-24),m.index),after=pageText.slice(m.index,Math.min(pageText.length,m.index+34));return before+' '+after};
  const creditMatch=validMoney.find(m=>/cart[aã]o|cr[eé]dito|parcelad[oa]/i.test(paymentContext(m)));
  const cashMatch=validMoney.find(m=>/à\s?vista|no\s*pix|pix|boleto|dinheiro/i.test(paymentContext(m))&&!(installmentAmount&&Math.abs(parseMoney(m[1])-installmentAmount)<0.01));
  const schemaPrice=moneyValue(offers.price||offers.lowPrice||meta(html,'product:price:amount')||meta(html,'og:price:amount'));
  const schemaIsCardPrice=creditMatch&&schemaPrice&&Math.abs(schemaPrice-parseMoney(creditMatch[1]))<0.01;
  const schemaIsInstallmentAmount=installmentAmount&&schemaPrice&&Math.abs(schemaPrice-installmentAmount)<0.01;
  const schemaIsInstallmentTotal=installmentTotal&&schemaPrice&&Math.abs(schemaPrice-installmentTotal)<0.01;
  const cashPrice=cashMatch?parseMoney(cashMatch[1]):null;
  const creditPrice=installmentTotal|| (creditMatch?parseMoney(creditMatch[1]):null);
  const productPrice=!cashPrice&&!schemaIsCardPrice&&!schemaIsInstallmentAmount&&!schemaIsInstallmentTotal?schemaPrice:null;
  const fullPriceCandidates=[cashPrice,productPrice,creditPrice].filter(v=>Number.isFinite(v)&&v>0);
  const price=fullPriceCandidates.length?Math.max(...fullPriceCandidates):null;
  const priceText=[
    cashPrice?'À VISTA '+cashPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    creditPrice?'TOTAL PARCELADO '+creditPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    productPrice?'PREÇO ANUNCIADO '+productPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'',
    installmentAmount&&installmentCount?'PARCELA '+installmentCount+'X DE '+installmentAmount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+(/sem\s*juros/i.test(installmentPlan)?' SEM JUROS':/com\s*juros/i.test(installmentPlan)?' COM JUROS':''):''
  ].filter(Boolean).join(' · ');
  const title=product.name||meta(html,'og:title')||meta(html,'twitter:title')||clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description=product.description||meta(html,'og:description')||meta(html,'description');
  const titleModel=(String(title||'').match(/\b[A-Z]{1,5}[-]?\d{2,5}\s+(?:PLUS|PRO|MAX|DIGITAL|ELETRÔNICA|ELETRONICA)\b/i)||[])[0]||'';const sku=titleModel||product.sku||product.mpn||product.model||meta(html,'product:retailer_item_id')||meta(html,'og:sku')||(String(description||'').match(/modelo\s*[:\-]\s*([A-Z0-9-]+)/i)||[])[1]||(String(title||'').match(/\b[A-Z]{1,5}[-]?\d{2,5}(?:\s+[A-Z0-9]+)?\b/)||[])[0]||'';
  const textContent=pageText;
  const voltage=(textContent.match(/\b(?:BIVOLT|110\s?V|127\s?V|220\s?V|100\s?A\s?240\s?V)\b/i)||[])[0]||'';
  const warranty=(textContent.match(/garantia.{0,35}(?:\d+\s*(?:mes(?:es)?|anos?))/i)||[])[0]||'';
  const properties=Array.isArray(product.additionalProperty)?product.additionalProperty:[];
  const prop=(...terms)=>{const found=properties.find(p=>terms.some(t=>String(p.name||'').toLowerCase().includes(t)));return found?clean(found.value):''};
  const capacity=prop('capacidade','volume','litro','capacidade da tigela')||(textContent.match(/\b\d+(?:[,.]\d+)?\s?L\b/i)||[])[0]||'';
  const power=prop('potencia','potência')||(textContent.match(/\b\d{2,4}\s?W\b/i)||[])[0]||'';
  const rating=product.aggregateRating?.ratingValue||'';
  const reviewCount=product.aggregateRating?.reviewCount||product.aggregateRating?.ratingCount||'';
  const propertySpecs=properties.map(p=>clean((p.name||'')+': '+(p.value||''))).filter(Boolean);
  const featureTerms=['pedal','velocidades?','controle de velocidade','planetári[oa]','movimento planetário','batedores?','tigela','tampa','anti-respingos','inclinaç[aã]o','trava','material','base antiderrapante','ruído','motor','proteç[aã]o','timer','acessórios','gancho','globo','raquete','espátula','display','bot[aã]o','painel','funç[aã]o','desligamento automático','capacidade máxima','peso da massa'];
  const featureLines=[];
  for(const term of featureTerms){const match=textContent.match(new RegExp('.{0,65}'+term+'.{0,100}','i'));if(match){const line=clean(match[0]);if(line.length>12&&!featureLines.some(x=>x.toLowerCase()===line.toLowerCase()))featureLines.push(line)}}
  const specs=[...propertySpecs,...featureLines].filter((line,i,all)=>all.findIndex(x=>x.toLowerCase()===line.toLowerCase())===i).slice(0,18).join('\n');
  const technicalSummary=[brand&&('MARCA: '+clean(brand)),sku&&('MODELO: '+clean(sku)),capacity&&('CAPACIDADE: '+clean(capacity)),power&&('POTÊNCIA: '+clean(power)),warranty&&('GARANTIA: '+clean(warranty)),voltage&&('VOLTAGEM: '+clean(voltage)),rating&&('AVALIAÇÃO: '+rating+(reviewCount?' · '+reviewCount+' AVALIAÇÕES':'')),specs&&('CARACTERÍSTICAS E ESPECIFICAÇÕES:\n'+specs),description&&('DESCRIÇÃO DO FABRICANTE: '+clean(description))].filter(Boolean).join('\n');
  return json({title:clean(title),brand:clean(brand),model:clean(sku),description:clean(description),specs:specs||clean(description),technicalSummary,capacity,power,reviews:rating?(String(rating)+(reviewCount?' · '+reviewCount+' AVALIAÇÕES':'')):'',image:typeof image==='string'&&/^https:\/\//i.test(image)?image:'',price:moneyValue(price),cashPrice,creditPrice,productPrice,installmentAmount,installmentCount,installmentPlan,priceText,voltage:clean(voltage),warranty:clean(warranty),source:finalUrl.hostname});
 }catch(error){console.error('product metadata read failed',error);return json({error:'NÃO FOI POSSÍVEL LER OS DADOS DESTA PÁGINA.'},502)}
}
