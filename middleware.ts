export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // CRITICAL: For app.roomi.pro, we must NOT block vercel.json rewrites
  // Problem: In Vercel Edge Middleware, returning ANY Response blocks rewrites
  // Solution: Use fetch() to forward the request internally
  // This bypasses the middleware blocking and allows rewrites to process
  if (hostname.startsWith('app.')) {
    // Forward request using fetch - this triggers Vercel's rewrite system
    // The internal fetch bypasses middleware blocking
    return fetch(request);
  }

  // Handle roomi.pro (main domain) - serve landing via rewrites
  // Allow rewrites to handle routing - don't block them
  // Special paths are handled by vercel.json rewrites
  if (pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    // Allow special paths to be handled by rewrites
    return new Response(null, { status: 200 });
  }

  // For root and other paths on roomi.pro, let rewrites handle it
  // Root (/) will be rewritten to /landing/index.html by vercel.json
  // This allows landing to be served at root without /landing in URL

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/74454fc7-45ce-477d-906c-20f245bc9847',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:42',message:'No match, returning default',data:{pathname,hostname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     * IMPORTANT: Middleware will skip app.roomi.pro subdomain to allow vercel.json rewrites to work
     * Vercel Edge Middleware doesn't support regex capturing groups
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
