import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ area: null });

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/land-area?address=${encodeURIComponent(address)}`,
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ area: null });
  }
}
