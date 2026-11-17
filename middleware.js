// Page-level guard: redirects anonymous visitors to /login and non-staff
// away from /admin. (Every API route ALSO checks auth itself - the
// middleware is a convenience, not the security boundary.)
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED = ['/dashboard', '/skills', '/my-skills', '/sessions', '/resources', '/credits', '/admin'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  const token = req.cookies.get('ss_session')?.value;
  let payload = null;
  if (token && process.env.JWT_SECRET) {
    try {
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET)));
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith('/admin') && !['admin', 'staff'].includes(payload.role)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/skills/:path*', '/my-skills/:path*', '/sessions/:path*',
            '/resources/:path*', '/credits/:path*', '/admin/:path*'],
};
