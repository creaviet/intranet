import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { Provider } from 'next-auth/providers';

const issuer = process.env.OIDC_ISSUER || 'https://identity.example.invalid';
const clientId = process.env.OIDC_CLIENT_ID || 'configure-oidc-client-id';
const clientSecret = process.env.OIDC_CLIENT_SECRET || 'configure-oidc-client-secret';
const allowedDomains = new Set((process.env.ALLOWED_EMAIL_DOMAINS || 'example.com').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));

export function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  return allowedDomains.has(domain);
}

export function getAllowedEmailDomains(): string[] {
  return [...allowedDomains];
}

const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

// Local-only escape hatch so the starter is usable without an IdP.
// Never active in a production build and requires an explicit opt-in.
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

if (!secret) {
  console.error('[auth] Missing secret: set AUTH_SECRET or NEXTAUTH_SECRET in .env (see README "Configure"). Sign-in will fail with a Configuration error until then.');
}
const missingOidc = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'].filter((key) => !process.env[key]);
if (missingOidc.length > 0) {
  console.warn(`[auth] OIDC not configured (${missingOidc.join(', ')}). Company SSO will fail until these are set.${devLoginEnabled ? ' Use the local dev login for now.' : ''}`);
}

const companyProvider: Provider = {
  id: 'company',
  name: 'Company SSO',
  type: 'oidc',
  issuer,
  clientId,
  clientSecret,
  authorization: { params: { scope: process.env.OIDC_SCOPE || 'openid profile email' } },
  checks: ['pkce', 'state'],
  profile(profile) {
    const email = typeof profile.email === 'string' ? profile.email.toLowerCase() : '';
    const domain = email.split('@')[1] || '';
    if (!email || profile.email_verified !== true || !allowedDomains.has(domain)) {
      throw new Error('Access denied: verified company email required.');
    }
    return {
      id: String(profile.sub),
      name: typeof profile.name === 'string' ? profile.name : email,
      email,
      image: typeof profile.picture === 'string' ? profile.picture : null,
    };
  },
};

const devProvider = Credentials({
  id: 'dev',
  name: 'Local development login',
  credentials: { email: { label: 'Email', type: 'email', placeholder: 'you@example.com' } },
  authorize(credentials) {
    const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
    if (!email || !isAllowedEmail(email)) {
      console.warn(`[auth] Dev login rejected "${email || '(empty)'}": domain must be one of ${[...allowedDomains].join(', ')} (ALLOWED_EMAIL_DOMAINS).`);
      return null;
    }
    return { id: `dev:${email}`, email, name: email };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js v5 reads AUTH_SECRET; the scaffold documents NEXTAUTH_SECRET.
  // Accept both so a .env following the README actually works.
  secret,
  providers: devLoginEnabled ? [companyProvider, devProvider] : [companyProvider],
  // Self-hosted (non-Vercel) deployments are rejected as "UntrustedHost"
  // otherwise. Always pin the public URL via NEXTAUTH_URL/AUTH_URL behind a proxy.
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/', error: '/auth/error' },
  callbacks: {
    authorized({ auth }) { return !!auth?.user; },
    async session({ session, token }) {
      if (session.user && token.sub) (session.user as typeof session.user & { id: string }).id = token.sub;
      return session;
    },
  },
});
