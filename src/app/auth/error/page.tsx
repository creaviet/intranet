import Link from 'next/link';
import { getAllowedEmailDomains } from '@/auth/config';

type Args = { searchParams: Promise<{ error?: string }> };

const explanations: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: 'Sign-in is not configured yet',
    detail:
      'The server is missing required auth configuration. Check .env for AUTH_SECRET (or NEXTAUTH_SECRET) and a reachable OIDC issuer, client ID and client secret. Server logs show the exact cause.',
  },
  CredentialsSignin: {
    title: 'Email address not accepted',
    detail: `The local development login only accepts these email domains: ${getAllowedEmailDomains().join(', ')} (ALLOWED_EMAIL_DOMAINS). Use an address such as alice@${getAllowedEmailDomains()[0] ?? 'example.com'}.`,
  },
  AccessDenied: {
    title: 'Access denied',
    detail: 'Your identity provider did not return a verified email on an allowed company domain.',
  },
  Verification: {
    title: 'Sign-in link expired',
    detail: 'The verification token is no longer valid. Start the sign-in flow again.',
  },
  OAuthCallbackError: {
    title: 'The identity provider rejected the sign-in',
    detail:
      'Check that the callback URI /api/auth/callback/company is registered at your IdP and matches NEXTAUTH_URL exactly.',
  },
};

export default async function AuthErrorPage({ searchParams }: Args) {
  const { error } = await searchParams;
  const known = error ? explanations[error] : undefined;

  return (
    <main className="shell">
      <section className="panel">
        <h1>{known?.title ?? 'Sign-in failed'}</h1>
        <p>{known?.detail ?? 'An unexpected authentication error occurred. Check the server logs for details.'}</p>
        {error && <p className="muted">Error code: <code>{error}</code></p>}
        <p><Link href="/">Back to sign in</Link></p>
      </section>
    </main>
  );
}
