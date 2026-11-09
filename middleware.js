import { next } from '@vercel/functions';

const SUPABASE_URL = 'https://gjotzkvhvdqhnaoxcgxv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MIgd-yrCkY1_JZln8pZQNw_AE3sog86';
const ALLOWED_USER_ID = 'b163037a-b543-42a8-a6a5-eeee31291898';
const ALLOWED_EMAIL = 'cosmosconfeitaria@gmail.com';
const COOKIE_NAME = 'cosmos_access_token';

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const entry = raw.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function redirectToLogin(request, clearCookie) {
  const url = new URL('/index.html?auth=required', request.url);
  const headers = new Headers({
    Location: url.toString(),
    'Cache-Control': 'no-store, private',
    'Referrer-Policy': 'no-referrer'
  });
  if (clearCookie) {
    headers.append('Set-Cookie', COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  }
  return new Response(null, { status: 302, headers });
}

export const config = {
  matcher: ['/calculadora.html', '/flavor-generator.html']
};

export default async function middleware(request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token || token.length > 8192) return redirectToLogin(request, !!token);

  try {
    const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + token
      },
      cache: 'no-store'
    });

    if (!response.ok) return redirectToLogin(request, true);

    const user = await response.json();
    if (user.id !== ALLOWED_USER_ID ||
        String(user.email || '').toLowerCase() !== ALLOWED_EMAIL) {
      return redirectToLogin(request, true);
    }

    return next();
  } catch (error) {
    console.error('Falha ao validar sessão Cosmos:', error);
    return new Response('Não foi possível validar o acesso agora. Atualize a página em instantes.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
