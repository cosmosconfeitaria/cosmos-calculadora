const SUPABASE_URL = 'https://gjotzkvhvdqhnaoxcgxv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MIgd-yrCkY1_JZln8pZQNw_AE3sog86';
const ALLOWED_USER_ID = 'b163037a-b543-42a8-a6a5-eeee31291898';
const ALLOWED_EMAIL = 'cosmosconfeitaria@gmail.com';
const COOKIE_NAME = 'cosmos_access_token';

function cookieHeader(value, maxAge) {
  return COOKIE_NAME + '=' + value +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}

function clearCookie() {
  return cookieHeader('', 0) + '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try { return !!host && new URL(origin).host === host; }
  catch (_) { return false; }
}

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let body;
  try { body = await request.json(); }
  catch (_) { return new Response('Invalid JSON', { status: 400 }); }

  const token = body && body.access_token;
  if (typeof token !== 'string' || token.length < 40 || token.length > 8192 ||
      !/^[A-Za-z0-9._-]+$/.test(token)) {
    return new Response('Invalid session token', {
      status: 400,
      headers: { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' }
    });
  }

  try {
    const verification = await fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + token
      },
      cache: 'no-store'
    });

    if (!verification.ok) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' }
      });
    }

    const user = await verification.json();
    if (user.id !== ALLOWED_USER_ID ||
        String(user.email || '').toLowerCase() !== ALLOWED_EMAIL) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' }
      });
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Set-Cookie': cookieHeader(token, 3600),
        'Cache-Control': 'no-store, private',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Falha ao validar sessão:', error);
    return new Response('Authentication service unavailable', {
      status: 503,
      headers: { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' }
    });
  }
}

export async function DELETE(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': clearCookie(),
      'Cache-Control': 'no-store, private',
      'Pragma': 'no-cache'
    }
  });
}
