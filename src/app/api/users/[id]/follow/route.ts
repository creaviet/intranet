import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user } = await requireEmployee();
    const { id } = await ctx.params;
    if (String(user.id) === String(id)) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    const existing = await payload.find({ collection: 'follows', where: { and: [{ follower: { equals: user.id } }, { followee: { equals: id } }] }, limit: 1, overrideAccess: true });
    return NextResponse.json({ following: !!existing.docs[0] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user } = await requireEmployee();
    const { id } = await ctx.params;
    if (String(user.id) === String(id)) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    const existing = await payload.find({ collection: 'follows', where: { and: [{ follower: { equals: user.id } }, { followee: { equals: id } }] }, limit: 1, overrideAccess: true });
    if (existing.docs[0]) {
      await payload.delete({ collection: 'follows', id: existing.docs[0].id, overrideAccess: true });
      return NextResponse.json({ following: false });
    }
    await payload.create({ collection: 'follows', data: { follower: user.id, followee: id }, overrideAccess: true });
    return NextResponse.json({ following: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}