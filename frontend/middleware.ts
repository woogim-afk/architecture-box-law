import { NextRequest, NextResponse } from 'next/server';

const BLOG_ORIGIN = 'https://box-archi.tistory.com';
const COOKIE_NAME = 'blog_access';
const COOKIE_VALUE = 'granted';

export function middleware(request: NextRequest) {
  // API 라우트, 정적 파일은 통과
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // 블로그에서 온 요청 → 쿠키 발급 후 통과
  const referer = request.headers.get('referer') ?? '';
  if (referer.includes('box-archi.tistory.com')) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 60 * 60 * 24, // 24시간
    });
    return res;
  }

  // 블로그 접근 쿠키 있으면 통과
  if (request.cookies.get(COOKIE_NAME)?.value === COOKIE_VALUE) {
    return NextResponse.next();
  }

  // 그 외 직접 접근 → 블로그로 리다이렉트
  return NextResponse.redirect(BLOG_ORIGIN);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
