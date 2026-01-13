export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // Handle app.roomi.pro subdomain - rewrite to /app
  if (hostname.startsWith('app.')) {
    // If already on /app path or special paths, allow it
    if (pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
      return new Response(null);
    }
    // Rewrite root and other paths to /app
    const newUrl = new URL(request.url);
    newUrl.pathname = `/app${pathname === '/' ? '' : pathname}`;
    return fetch(newUrl, request);
  }

  // Handle roomi.pro (main domain) - serve landing
  // If already on /landing or /app path, allow it
  if (pathname.startsWith('/landing') || pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    return new Response(null);
  }

  // Rewrite root to /landing
  if (pathname === '/') {
    const newUrl = new URL(request.url);
    newUrl.pathname = '/landing/';
    return fetch(newUrl, request);
  }

  return new Response(null);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
