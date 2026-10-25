import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';

export async function GET() {
  try {
    const { payload } = await requireEmployee();
    const result = await payload.find({ collection: 'users', where: { active: { equals: true } }, limit: 100, overrideAccess: true });
    return NextResponse.json({ docs: result.docs.map((u: { id: string | number; name?: string | null }) => ({ id: String(u.id), name: u.name ?? null })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}