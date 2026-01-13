export default function middleware(request: Request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // Handle app.roomi.pro subdomain - redirect to /app
  if (hostname.startsWith('app.')) {
    // If already on /app path or special paths, allow it
    if (pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
      return;
    }
    // Redirect root and other paths to /app
    const newUrl = new URL('/app/', url.origin);
    if (pathname !== '/') {
      newUrl.pathname = `/app${pathname}`;
    }
    return Response.redirect(newUrl, 307);
  }

  // Handle roomi.pro (main domain) - serve landing
  // If already on /landing or /app path, allow it
  if (pathname.startsWith('/landing') || pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    return;
  }

  // Redirect root to /landing
  if (pathname === '/') {
    const newUrl = new URL('/landing/', url.origin);
    return Response.redirect(newUrl, 307);
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
