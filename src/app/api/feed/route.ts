import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';

function extractText(value: unknown): string {
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.text === 'string') out.push(rec.text);
    for (const key of Object.keys(rec)) visit(rec[key]);
  };
  visit(value);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function parseArray(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function intersect(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(b);
  return a.some((v) => set.has(v));
}

function toArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === 'string' ? v : (v as { value?: string })?.value)).filter((v): v is string => typeof v === 'string');
}

export async function GET(request: Request) {
  try {
    const { payload } = await requireEmployee();
    const url = new URL(request.url);
    const subDepartments = parseArray(url.searchParams.get('departments'));
    const subUsers = parseArray(url.searchParams.get('users'));
    const subTags = parseArray(url.searchParams.get('tags'));
    const hasFilter = subDepartments.length > 0 || subUsers.length > 0 || subTags.length > 0;

    const items: Array<{
      kind: 'post' | 'article';
      id: string;
      title: string;
      url: string;
      date: string | null;
      departments: string[];
      tags: string[];
      users: string[];
      post?: unknown;
      preview?: string;
      author?: { id: string; name: string | null; department: string | null } | null;
    }> = [];

    // Fetch full published article docs
    const pageResult = await payload.find({
      collection: 'pages',
      where: { status: { equals: 'published' }, kind: { equals: 'article' } },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    });
    for (const doc of pageResult.docs as Array<Record<string, unknown>>) {
      const departments = toArrayField(doc.departments);
      const tags = toArrayField(doc.tags);
      const users = Array.isArray(doc.people) ? (doc.people as string[]) : [];
      const author = doc.author && typeof doc.author === 'object' ? (doc.author as { id?: string; name?: string | null; department?: string | null }) : null;
      const item = {
        kind: 'article' as const,
        id: String(doc.id),
        title: String(doc.publishedTitle ?? doc.title ?? ''),
        url: `/p/${doc.slug}`,
        date: (doc.publishedAt as string) ?? null,
        departments,
        tags,
        users: [...users, ...(author?.id ? [author.id] : [])],
        preview: extractText(doc.publishedData).slice(0, 240),
        author: author ? { id: String(author.id), name: author.name ?? null, department: author.department ?? null } : null,
      };
      if (hasFilter) {
        const match =
          (subDepartments.length && intersect(departments, subDepartments)) ||
          (subTags.length && intersect(tags, subTags)) ||
          (subUsers.length && intersect(users, subUsers));
        if (!match) continue;
      }
      items.push(item);
    }

    // Posts
    const postResult = await payload.find({
      collection: 'posts',
      limit: 100,
      depth: 1,
      sort: '-createdAt',
      overrideAccess: true,
    });
    for (const doc of postResult.docs as Array<Record<string, unknown>>) {
      const departments = toArrayField(doc.departments);
      const tags = toArrayField(doc.tags);
      const author = doc.author ? String(doc.author) : null;
      const mentions = Array.isArray(doc.mentions) ? (doc.mentions as string[]) : [];
      const users = [author, ...mentions].filter((v): v is string => Boolean(v));
      const item = {
        kind: 'post' as const,
        id: String(doc.id),
        title: String(doc.title ?? ''),
        url: `/posts/${doc.id}`,
        date: (doc.createdAt as string) ?? null,
        departments,
        tags,
        users,
        post: doc,
      };
      if (hasFilter) {
        const match =
          (subDepartments.length && intersect(departments, subDepartments)) ||
          (subTags.length && intersect(tags, subTags)) ||
          (subUsers.length && intersect(users, subUsers));
        if (!match) continue;
      }
      items.push(item);
    }

    items.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 500;
    return NextResponse.json({ error: 'Could not load feed' }, { status });
  }
}
