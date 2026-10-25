# Company Intranet Starter

A starter scaffold for a self-hosted company intranet using Next.js App Router, TypeScript, Payload CMS 3, MongoDB, Puck, and OIDC sign-in via Auth.js.

## What's implemented in this scaffold

- Docker Compose service for MongoDB and the Next.js application.
- Payload collections for users, posts, comments, reactions, notifications, Puck pages, and reusable blocks (templates).
- OIDC provider configuration with PKCE/state, verified email requirement, and an allowlist of email domains.
- API routes for creating/listing posts, comments, reactions, notifications, and marking notifications read.
- Notification records for post mentions, comments on a post, and new reactions.
- Server-sent events (SSE) endpoint that checks for new notifications every three seconds and pushes them to connected clients.
- Minimal feed UI, composer, reaction buttons, notification list, and a Puck editor component/config.
- Puck publishing workflow: editors save a working draft, publish a snapshot, preview the draft, and unpublish without deleting the draft. The live version stays online while its draft is edited.
- Content types: editors choose **Article** (mixed into the **Company feed** at `/`) or **Page** (standalone, not listed) in the editor dashboard or the editor itself.
- Reusable blocks in two modes: **fixed** blocks share one live content instance across all pages; **template** blocks keep their structure fixed and expose their text fields per page instance.
- Unique, case-insensitive block names and page/article titles.
- Unit tests for notification helpers, Puck publishing, fixed/template block helpers, dynamic Puck configuration, and the Puck/template APIs (access, validation, size limits, CSRF origin).

## Important limitations — not production-ready yet

This is a starter, not a fully security-reviewed product. Do not deploy it with real employee data until the items below are completed and tested.

1. **Employee identity mapping:** the first verified OIDC login provisions a Payload user. Confirm your IdP's `sub` stability and email/domain policy. For an enterprise rollout, provision/deprovision users from your directory and synchronize departments/roles.
2. **Payload admin authentication:** the default Payload admin route is scaffolded, but OIDC has not been wired into Payload's own admin login. Keep `/admin` inaccessible externally until a Payload-compatible auth strategy is implemented, or configure an isolated admin account and protect the route at the reverse proxy. Do not assume the intranet OIDC session automatically authenticates Payload Admin.
3. **Access control:** collection access rules are starter rules. The custom app API uses verified sessions and `overrideAccess`; review every route and collection before production. Add edit/delete endpoints with ownership checks if required.
4. **Mentions UI:** the API accepts `mentions: ["payload-user-id", ...]`; a searchable people picker and inline `@` autocomplete are not implemented yet.
5. **Comments UI:** comments can be created and are notified, but listing/rendering existing comments and threaded replies are not implemented in the current UI.
6. **Puck publishing:** draft/published snapshots, editor-role checks, draft preview, unpublish, home-feed links, and reusable blocks are implemented. There is no revision history, scheduled publishing, approval workflow, or audit trail yet.
7. **Reusable blocks:** there is no delete UI yet. Fixed blocks are live shared components, so editing one changes every page that embeds it, including published pages. Template blocks protect existing pages: editing a template block saves a **new** block and does not alter old instances. Per-instance editing currently covers only fields of type `text` and `textarea` on base components; custom fields will need explicit field definitions. Self-references and indirect reference cycles are rejected by the API to prevent recursive rendering. A broken template row is skipped at render time instead of failing the page.
8. **Realtime transport:** SSE delivers near-real-time notifications using three-second database polling, not MongoDB change streams or a message broker. For large deployments, use a queue/pub-sub system and robust disconnect cleanup.
9. **Reaction uniqueness:** the application checks for an existing reaction, but a MongoDB-level unique compound index on `(post,user)` still needs to be added to prevent races.
10. **Operational readiness:** add CSRF/origin protection for mutation routes, rate limits, audit logs, malware scanning for uploads, backups/restore drills, monitoring, and automated integration/e2e tests.
11. **Rich text:** post body is currently stored in a minimal Lexical-shaped document from plain text. Use a rich-text composer before enabling formatting.

## Requirements

- Docker Engine + Docker Compose plugin
- An OIDC identity provider with a registered client
- Node.js 22+ and npm (for local development)

## Configure

```bash
cp .env.example .env
```

Set:
- `PAYLOAD_SECRET` and `NEXTAUTH_SECRET` to independent cryptographically random secrets.
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` to a reachable provider; the example issuer is a placeholder and sign-in fails until you replace it.
- `ALLOWED_EMAIL_DOMAINS` to your exact company email domain(s), comma-separated.
- `NEXTAUTH_URL` to the external URL users will access.

Auth errors are explained at `/auth/error`; the server console logs the precise cause (e.g. `MissingSecret`, `fetch failed`).

Register this callback URI with your identity provider:

`https://YOUR-INTRANET-HOST/api/auth/callback/company`

Use HTTPS in every non-local environment. Configure logout/session policy to match your company requirements.

## Run with Docker

```bash
docker compose up --build
```

Open `http://localhost:3000`. Sign in with Company SSO. Payload Admin is at `/admin` but is not wired to the OIDC login in this starter—see limitations above.

## Local development

Start MongoDB separately, then:

```bash
npm install
cp .env.example .env
# For local npm dev, set DATABASE_URI=mongodb://localhost:27017/intranet in .env
npm run dev
```

Without access to an identity provider, set `ALLOW_DEV_LOGIN=true` in `.env` (local only). A development email form then appears on the sign-in page; any address on `ALLOWED_EMAIL_DOMAINS` is accepted. This provider is ignored when `NODE_ENV=production`.

Create (or promote) a local editor account:

```bash
npm run seed:dev
# or: SEED_EDITOR_EMAIL=someone@example.com npm run seed:dev
```

That creates `editor@example.com` with the `editor` role. Sign in through the dev login with that address — there is no password. The seed script refuses to run when `NODE_ENV=production`.

## Troubleshooting: `Expected clientReferenceManifest to be defined`

This is a corrupted `.next` dev cache, usually caused by running multiple `next dev`
processes for the same project or by running `npm run build` while `next dev` is
still running. Fix it with:

```bash
pkill -f "company-intranet-starter/node_modules/.bin/next dev"
rm -rf .next
npm run dev
```

Then hard-reload the browser. Do not run `npm run build` against a directory that
a dev server is currently using.

## Tests and checks

```bash
npm test
npm run lint
npm run build
```

The included tests cover notification helpers, Puck version/publish helpers, the home-feed query, title/name uniqueness helpers, fixed/template block field extraction and application, dynamic Puck configuration, and the Puck page/template API routes with a mocked Payload store and mocked identity. They do not prove end-to-end OIDC, MongoDB persistence, SSE, or browser behavior.

## API overview

All custom application routes require an OIDC session:
- `GET /api/posts`
- `POST /api/posts` JSON `{ "title": "Title", "text": "Post body", "mentions": ["payload-user-id"] }`
- `GET /api/posts/:id/comments`
- `POST /api/posts/:id/comments` JSON `{ "text": "Comment", "mentions": ["payload-user-id"] }`
- `POST /api/posts/:id/reactions` JSON `{ "emoji": "👍" }`
- `GET /api/notifications`
- `PATCH /api/notifications` JSON `{ "id": "notification-id", "read": true }`
- `GET /api/notifications/stream` (SSE)
- `GET /api/puck?slug=welcome` (live published page data, any employee)
- `GET /api/puck?slug=welcome&status=draft` (working copy, editors/admins only)
- `PUT /api/puck` JSON `{ "slug": "welcome", "title": "Welcome", "status": "draft" | "published", "kind": "article" | "page", "data": { ...Puck data } }` (editors/admins only; `showOnFeed` is still accepted for backward compatibility)
- `PATCH /api/puck` JSON `{ "slug": "welcome" }` (unpublish, editors/admins only)
- `GET /api/puck/templates` (list reusable blocks, editors/admins only)
- `GET /api/puck/templates?id=...` (load one reusable block for editing, editors/admins only)
- `POST /api/puck/templates` JSON `{ "name": "Hero block", "mode": "fixed" | "template", "data": { ...Puck data } }` (editors/admins only; `mode` defaults to `fixed`)
- `PUT /api/puck/templates` JSON `{ "id": "...", "name": "Hero block", "data": { ...Puck data } }` (editors/admins only; fixed blocks only, rejects reference cycles and duplicate names)
- Template blocks cannot be mutated through `PUT`; save a changed structure as a new block with `POST`.

### Puck publishing behaviour

- **Save draft** updates the working copy. If the page is already live, the published snapshot is left untouched.
- **Publish** (Puck's header button) promotes the current canvas to the live snapshot and updates `publishedAt`.
- **Preview draft** opens `/p/welcome?preview=draft`; only editors/admins can see it, and employees keep seeing the live version.
- **Unpublish** takes the page offline without deleting the draft, so it can be published again later.
- **Content type** is chosen with the Article/Page radios in the editor. Published articles are mixed into the **Company feed** on `/` alongside posts; pages are only reachable by URL.
- **Titles must be unique** across articles and pages (case-insensitive, trimmed). Renaming a page keeps its own title valid.
- The feed setting is snapshotted at publish time, so switching an article to a page in the draft does not remove the live article until you republish.
- The Pages collection stores `kind`, `draftData`, `publishedData`, `publishedTitle`, `showOnFeed`, `publishedShowOnFeed`, `status`, and `publishedAt`. `showOnFeed`/`publishedShowOnFeed` are internal compatibility snapshot fields derived from `kind`. Payload field access hides `draftData` from non-editors even when the published document is readable.
- The editor dashboard at `/editor` lists existing content and offers separate article/page creation. Legacy rows without `kind` are treated as articles, which matches their old feed behaviour.

### Reusable blocks: fixed vs template

- In the editor, choose **Fixed block** or **Template block**, enter a unique name, and click **Save as block**.
- **Fixed blocks** are shared live instances. They appear in the palette as **Fixed: name** and use one canvas for every page. Editing the block changes all pages that embed it, including published pages.
- **Template blocks** are reusable structures. They appear as **Template: name**. Each page receives its own values for the template's `text` and `textarea` fields, edited in Puck's sidebar. Structure and labels come from the template; per-page content does not.
- Editing a template block in `/editor/blocks/<id>` saves a **new** template block (name prefilled, e.g. `Card v2`). Existing pages keep using the old block and its saved content. Editing a fixed block updates it in place.
- Blocks can contain other blocks. They are resolved live; a broken/missing block is skipped instead of failing the whole page.
- Block names are unique case-insensitively across both modes. Duplicate names and page/article titles are rejected with HTTP 409.
- A block cannot contain itself directly or indirectly; the API rejects save attempts that would create a reference cycle across fixed and template blocks.
- Template data is validated and size-limited (1 MiB) like page data. There is no delete UI yet.

## Recommended next implementation steps

1. Wire OIDC identity into Payload Admin or keep `/admin` behind a trusted internal reverse proxy.
2. Add employee directory search + `@mention` autocomplete and store mentions in posts/comments.
3. Add comment list, reply, edit/delete, and post edit/delete UX.
4. Extend Puck publishing with revision history, scheduled publishing, an approval workflow, and an audit log of who published what.
5. Add a compound unique index for reactions and indexes for notification feed queries.
6. Add integration tests with a disposable MongoDB and browser tests with Playwright.
