import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';

export async function GET() {
  try {
    const { payload, user } = await requireEmployee();
    const res = await payload.find({ collection: 'follows', where: { follower: { equals: user.id } }, limit: 200, overrideAccess: true });
    const ids = res.docs.map((d: Record<string, unknown>) => {
      const f = d.followee;
      return typeof f === 'object' && f ? String((f as { id: string | number }).id) : String(f);
    });
    return NextResponse.json({ ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}