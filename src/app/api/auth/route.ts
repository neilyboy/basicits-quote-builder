import { NextRequest, NextResponse } from 'next/server';
import { verifyPin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });
  if (verifyPin(pin)) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
}
