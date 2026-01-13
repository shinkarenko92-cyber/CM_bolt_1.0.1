export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // Handle app.roomi.pro subdomain - rewrite to /app
  if (hostname.startsWith('app.')) {
    // If already on /app path or special paths, allow it
    if (pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
      return;
    }
    // Rewrite root and other paths to /app
    url.pathname = `/app${pathname === '/' ? '' : pathname}`;
    return new Response(null, {
      status: 200,
      headers: {
        'x-middleware-rewrite': url.pathname,
      },
    });
  }

  // Handle roomi.pro (main domain) - serve landing
  // If already on /landing or /app path, allow it
  if (pathname.startsWith('/landing') || pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    return;
  }

  // Rewrite root to /landing
  if (pathname === '/') {
    url.pathname = '/landing/';
    return new Response(null, {
      status: 200,
      headers: {
        'x-middleware-rewrite': url.pathname,
      },
    });
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
