export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // CRITICAL: For app.roomi.pro, we must NOT block vercel.json rewrites
  // Problem: In Vercel Edge Middleware, returning ANY Response blocks rewrites
  // Solution: For app.roomi.pro, use fetch() to forward request which allows rewrites
  // Special handling for OAuth callback to ensure it works correctly
  if (hostname.startsWith('app.')) {
    // For OAuth callback path, we need to ensure rewrites work
    // fetch() should work, but if it doesn't, we'll try a different approach
    if (pathname === '/auth/avito-callback') {
      // For OAuth callback, forward using fetch to allow rewrites
      // This should process the rewrite to /index.html correctly
      return fetch(request);
    }
    // For all other paths on app.roomi.pro, forward using fetch
    return fetch(request);
  }

  // Handle roomi.pro (main domain) - serve landing
  // If already on /landing or special paths, allow it
  if (pathname.startsWith('/landing') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:30',message:'Already on landing/app path, allowing',data:{pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return new Response(null, { status: 200 });
  }

  // Redirect root to /landing
  if (pathname === '/') {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:36',message:'Redirecting root to landing',data:{hostname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const newUrl = new URL('/landing/', url.origin);
    return Response.redirect(newUrl, 307);
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:42',message:'No match, returning default',data:{pathname,hostname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and OAuth callback
     * IMPORTANT: Middleware will skip app.roomi.pro subdomain to allow vercel.json rewrites to work
     * Vercel Edge Middleware doesn't support regex capturing groups
     * 
     * NOTE: We exclude /auth/avito-callback from matcher to allow rewrites to work
     * This prevents middleware from interfering with OAuth callback processing
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|auth/avito-callback|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
