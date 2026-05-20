import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const addresses: string[] = await req.json();
    const res = await fetch(`${BACKEND_URL}/api/land-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addresses),
    });
    if (!res.ok) return NextResponse.json({ parcels: [], merged_zones: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ parcels: [], merged_zones: [] }, { status: 500 });
  }
}
