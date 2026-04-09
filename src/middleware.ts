import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const pathname = request.nextUrl.pathname;

  // On admin.triarch.dev, redirect root to /admin
  if (hostname.startsWith('admin.') && pathname === '/') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
