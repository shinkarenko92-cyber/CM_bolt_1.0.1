export default function middleware(request: Request) {
  // Minimal middleware - let vercel.json rewrites handle all routing
  // Only skip for static files to allow direct serving
  const pathname = new URL(request.url).pathname;
  
  // Skip middleware for static files - they're served directly by Vercel
  if (pathname.startsWith('/assets/') || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)$/)) {
    return new Response(null, { status: 200 });
  }

  // Let vercel.json rewrites handle all routing
  return fetch(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     * Vercel Edge Middleware doesn't support regex capturing groups
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|json|xml|txt|pdf|zip)).*)',
  ],
};
