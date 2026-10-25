import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { findPageBySlug } from '@/lib/pages';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { payload } = await requireEmployee();
    const { slug } = await params;
    const page = await findPageBySlug(payload, slug);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const comments = await payload.find({
      collection: 'comments',
      where: { page: { equals: page.id } },
      sort: '-createdAt',
      limit: 50,
      depth: 1,
      overrideAccess: true,
    });
    return NextResponse.json(comments.docs);
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
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    const comment = await payload.create({
      collection: 'comments',
      data: { page: page.id, author: user.id, body: text },
      overrideAccess: true,
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}
