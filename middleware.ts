import { NextRequest, NextResponse } from '@vercel/edge';

export default function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // Handle app.roomi.pro subdomain - rewrite to /app
  if (hostname.startsWith('app.')) {
    // If already on /app path or special paths, allow it
    if (pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
      return NextResponse.next();
    }
    // Rewrite root and other paths to /app
    const url = request.nextUrl.clone();
    url.pathname = `/app${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  // Handle roomi.pro (main domain) - serve landing
  // If already on /landing or /app path, allow it
  if (pathname.startsWith('/landing') || pathname.startsWith('/app') || pathname.startsWith('/functions') || pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  // Rewrite root to /landing
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/landing/';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
