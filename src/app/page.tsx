import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import Link from 'next/link';
import { auth, signIn, signOut, devLoginEnabled, isAllowedEmail } from '@/auth/config';
import { isEditorRole, requireEmployee } from '@/lib/identity';
import { findFeedPages } from '@/lib/pages';
import { Intranet } from '@/components/Intranet';
import { HeaderBell } from '@/components/HeaderBell';
import { getPayload } from 'payload';
import config from '@payload-config';
import { findPageBySlug, getPublishedVersion } from '@/lib/pages';
import { findTemplateSummaries, selectReferencedTemplates } from '@/lib/templates';
import { PuckRenderer } from '@/components/PuckRenderer';

/**
 * Auth.js throws on failed sign-in inside a Server Action instead of
 * redirecting. Without this, Next.js shows a raw "CredentialsSignin" runtime
 * error (dev overlay) instead of an actionable page.
 */
function handleAuthError(error: unknown): never {
  if (error instanceof AuthError) {
    redirect(`/auth/error?error=${encodeURIComponent(error.type)}`);
  }
  throw error;
}

async function signInWithCompany() {
  'use server';
  try {
    await signIn('company', { redirectTo: '/' });
  } catch (error) {
    handleAuthError(error);
  }
}

async function signInWithDev(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  if (!isAllowedEmail(email)) redirect('/auth/error?error=CredentialsSignin');
  try {
    await signIn('dev', { email, redirectTo: '/' });
  } catch (error) {
    handleAuthError(error);
  }
}

async function signOutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Inside · Company Intranet</h1>
          <p>Sign in using your company identity provider.</p>
          <form action={signInWithCompany}>
            <button>Sign in with Company SSO</button>
          </form>
          {devLoginEnabled && (
            <>
              <p className="muted" style={{ marginTop: 20 }}>Local development only. Disabled in production builds.</p>
              <form action={signInWithDev}>
                <div className="row">
                  <input name="email" type="email" aria-label="Development login email" placeholder="you@example.com" required />
                  <button className="secondary" type="submit">Dev sign in</button>
                </div>
              </form>
            </>
          )}
        </section>
      </main>
    );
  }

  const payloadForUser = await getPayload({ config });
  const userDocs = await payloadForUser.find({ collection: 'users', where: { email: { equals: session.user.email } }, limit: 1, overrideAccess: true });
  const currentUser = userDocs.docs[0] as { id: string | number } | undefined;
  const profileHref = currentUser ? `/u/${currentUser.id}` : '#';

  // If a published Puck page with slug "home" exists, render it (with its
  // master frame) instead of the hard-coded feed, so the intranet frame can be
  // edited visually.
  const payload = await getPayload({ config });
  const homePage = await findPageBySlug(payload, 'home');
  const homeVersion = homePage ? getPublishedVersion(homePage) : null;
  if (homeVersion) {
    let renderData = homeVersion.data;
    const layoutSlug = homePage?.layoutSlug;
    if (layoutSlug) {
      const layoutPage = await findPageBySlug(payload, layoutSlug);
      const layoutVersion = layoutPage ? getPublishedVersion(layoutPage) : null;
      if (layoutVersion) {
        const combined = structuredClone(layoutVersion.data) as typeof layoutVersion.data;
        const inject = (value: unknown): boolean => {
          if (Array.isArray(value)) {
            for (const item of value) if (inject(item)) return true;
            return false;
          }
          if (!value || typeof value !== 'object') return false;
          const record = value as Record<string, unknown>;
          if (record.type === 'Frame' && record.props && typeof record.props === 'object') {
            (record.props as Record<string, unknown>).content = homeVersion.data.content;
            return true;
          }
          for (const key of Object.keys(record)) {
            if (inject(record[key])) return true;
          }
          return false;
        };
        if (inject(combined)) renderData = combined;
      }
    }
    const templates = selectReferencedTemplates(renderData, await findTemplateSummaries(payload));
    const context = await requireEmployee().catch(() => null);
    const canEdit = context ? isEditorRole(context.user.role) : false;
    return (
      <>
        <header>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {canEdit && <Link className="button-link" href="/editor">Content editor</Link>}
            <HeaderBell />
            <Link href={profileHref} style={{ color: 'white' }}>{session.user.name || session.user.email}</Link>
            <form action={signOutAction}><button className="secondary">Sign out</button></form>
          </div>
        </header>
        <main className="shell">
          <PuckRenderer data={renderData} templates={templates} />
        </main>
      </>
    );
  }

  const context = await requireEmployee().catch(() => null);
  const canEdit = context ? isEditorRole(context.user.role) : false;

  let articles: Array<{ slug: string; title: string; publishedAt: string | null }> = [];
  if (context) {
    articles = await findFeedPages(context.payload, 50).catch(() => []);
  }

  return (
    <>
      <header>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {canEdit && (
            <Link className="button-link" href="/editor">Content editor</Link>
          )}
          <HeaderBell />
          <Link href={profileHref} style={{ color: 'white' }}>{session.user.name || session.user.email}</Link>
          <form action={signOutAction}><button className="secondary">Sign out</button></form>
        </div>
      </header>
      <Intranet articles={articles} />
    </>
  );
}
