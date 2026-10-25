import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { findPageBySlug } from '@/lib/pages';

const allowed = new Set(['👍', '❤️', '🎉', '🙌']);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { payload } = await requireEmployee();
    const { slug } = await params;
    const page = await findPageBySlug(payload, slug);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const reactions = await payload.find({
      collection: 'reactions',
      where: { page: { equals: page.id } },
      limit: 200,
      depth: 1,
      overrideAccess: true,
    });
    const items = reactions.docs.map((r: Record<string, unknown>) => {
      const user = r.user && typeof r.user === 'object' ? (r.user as { id?: string; name?: string | null }) : null;
      return { emoji: r.emoji, user: user ? { id: String(user.id), name: user.name ?? null } : null };
    });
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { payload, user } = await requireEmployee();
    const { slug } = await params;
    const page = await findPageBySlug(payload, slug);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await request.json();
    if (typeof body.emoji !== 'string' || !allowed.has(body.emoji)) return NextResponse.json({ error: 'Unsupported reaction' }, { status: 400 });
    const existing = await payload.find({
      collection: 'reactions',
      where: { and: [{ page: { equals: page.id } }, { user: { equals: user.id } }] },
      limit: 1,
      overrideAccess: true,
    });
    if (existing.docs[0]) {
      const previousEmoji = (existing.docs[0] as { emoji?: string }).emoji;
      if (previousEmoji === body.emoji) await payload.delete({ collection: 'reactions', id: existing.docs[0].id, overrideAccess: true });
      else {
        await payload.delete({ collection: 'reactions', id: existing.docs[0].id, overrideAccess: true });
        await payload.create({ collection: 'reactions', data: { page: page.id, user: user.id, emoji: body.emoji }, overrideAccess: true });
      }
    } else {
      await payload.create({ collection: 'reactions', data: { page: page.id, user: user.id, emoji: body.emoji }, overrideAccess: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}
