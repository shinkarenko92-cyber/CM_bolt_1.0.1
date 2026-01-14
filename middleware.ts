export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // CRITICAL: For app.roomi.pro, we must NOT block vercel.json rewrites
  // Problem: In Vercel Edge Middleware, returning ANY Response blocks rewrites
  // Solution: For app.roomi.pro, don't process at all - let rewrites handle it
  // Special case: OAuth callback must be excluded from middleware processing
  if (hostname.startsWith('app.')) {
    // For app.roomi.pro, don't process - this allows vercel.json rewrites to work
    // Returning undefined or not matching in matcher would be ideal, but we can't do that
    // So we use fetch() but with a check to prevent infinite loops
    // Check if this is already an internal fetch (has special header)
    const isInternalFetch = request.headers.get('x-middleware-rewrite');
    if (isInternalFetch) {
      // This is already an internal fetch, don't process again
      return new Response(null, { status: 200 });
    }
    // Forward request using fetch - this triggers Vercel's rewrite system
    // The internal fetch bypasses middleware blocking
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
     * IMPORTANT: Exclude /auth/avito-callback to prevent middleware from processing it
     * This allows vercel.json rewrites to work directly for OAuth callback
     * For app.roomi.pro, middleware uses fetch(request) which should bypass processing
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|auth/avito-callback|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
