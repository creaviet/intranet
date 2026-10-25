# Company Intranet Starter — Implementation Summary

## Current state

Next.js 15 App Router starter with Payload CMS 3 + MongoDB, Auth.js OIDC/dev login,
a minimal company feed (posts/comments/reactions/notifications), and a Puck visual
page editor with a complete draft/publish workflow, article/page content types,
intranet-feed links, and reusable blocks in fixed and template modes.

## Puck publishing (implemented)

- `src/collections/Pages.ts`
  - `kind` (`article`/`page`): articles are listed in the intranet feed, pages are standalone.
  - `draftData` (working copy) and `publishedData` (live snapshot) are separate.
  - `publishedTitle`, `showOnFeed`/`publishedShowOnFeed`, `status` (`draft`/`published`),
    `publishedAt`, timestamps.
  - `showOnFeed`/`publishedShowOnFeed` are internal compatibility snapshots derived from
    `kind`; two-way editor choice lives in `kind`.
  - A `beforeChange` hook keeps `showOnFeed` aligned when Payload admin writes `kind`.
    Legacy rows without `kind` are treated as articles and remain updatable.
  - Draft field read/write is restricted to editor/admin at Payload field level.
- `src/app/api/puck/route.ts`
  - `GET ?slug=&status=draft|published` — published is employee-readable, draft is editor-only.
  - `PUT { slug, title, data, status, kind }` — saves draft always; publishing also promotes the snapshot. Legacy `showOnFeed` is still accepted. Rejects a title already used by another article/page with HTTP 409.
  - `PATCH { slug }` — unpublishes while keeping the draft.
  - Same-origin check on mutations, size/format validation, no-store responses.
- `src/lib/pages.ts`
  - Slug lookup, published/draft version resolution, `hasUnpublishedChanges` comparison,
    `getPageKind` legacy mapping, editor dashboard list (`findPageList`), the home-feed
    query (`findFeedPages`), and case-insensitive title uniqueness (`findPageByTitle`).
- `src/collections/Templates.ts` + `src/lib/templates.ts` + `src/app/api/puck/templates/route.ts`
  - Reusable blocks: `GET/POST/PUT /api/puck/templates`, editor-only, validated and size-limited.
  - `GET ?id=` loads one block; `POST` creates with `mode` `fixed`/`template` (default `fixed`);
    `PUT` renames/updates fixed blocks only. Template structure changes must be saved as a new block.
  - Block names are unique case-insensitively across both modes; duplicate names return 409.
  - Reference-cycle detection covers `SavedBlock_<id>` and `TemplateBlock_<id>` references,
    rejecting self-references and indirect cycles.
  - Saved blocks become dynamic Puck components: `SavedBlock_<id>` renders one shared canvas;
    `TemplateBlock_<id>` exposes per-instance text fields in the Puck sidebar.
- `src/app/editor/blocks/[id]/page.tsx` + `src/components/BlockEditor.tsx`
  - Fixed block: renames and updates the shared canvas; changes render immediately everywhere.
  - Template block: edits structure but saves as a **new** template block with a prefilled,
    unique name and redirects to it; existing page instances keep the old block and content.
  - Linked from the `/editor` dashboard and the page editor's saved-block list.
- `src/puck/config.tsx`
  - `createPuckConfig(templates)` exposes fixed blocks as `Fixed: name` and template blocks
    as `Template: name`, and renders nested block content.
  - Blocks are grouped into their own Puck sidebar sections (`Fixed blocks`, `Template blocks`)
    alongside the base `Components` section via `config.categories`.
- `src/lib/template-blocks.ts`
  - Automatically detects `text`/`textarea` fields on base Puck components, labels them
    (`Heading 1 · Title`), and overlays per-instance values (`f0`, `f1`, …) on the template.
- `src/components/Intranet.tsx`
  - Company feed merges posts and published articles, sorted by creation/publish time.
  - Articles use `publishedShowOnFeed` (the publish-time snapshot) and link to `/p/<slug>`.
  - There is no separate article section anymore.
- `src/app/editor/page.tsx` + `src/components/PageEditor.tsx`
  - `/editor` dashboard lists content and reusable blocks with mode-aware labels, and
    lets editors create an article or page.
  - Editor loads draft, save draft, Puck publish button, unpublish, draft preview link,
    published/draft status + timestamps, Article/Page radios, Fixed/Template block choice,
    "Save as block" workflow, and Edit links for saved blocks.
  - Header link now says "Content editor" and opens the dashboard.
- `src/app/p/[slug]/page.tsx`
  - Renders live `publishedData` with template support; `?preview=draft` renders the
    working copy for editors only.
- `src/app/page.tsx` — adds a "Content editor" link for editor/admin users.
- `scripts/seed-dev-editor.mjs` + `npm run seed:dev`
  - Idempotently creates/promotes `editor@example.com` as an active editor for
    the local dev login (configurable via `SEED_EDITOR_EMAIL`). Refuses to run
    with `NODE_ENV=production`.

## Verification

- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- `npm test` passes: 103 tests in 7 files.
  - `src/lib/events.test.ts` — notification helpers.
  - `src/lib/pages.test.ts` — version resolution, change detection, kind mapping,
    editor list, home-feed query, title uniqueness.
  - `src/lib/templates.test.ts` — template parsing, lookup, listing, fixed/template
    references, cycle detection, and page-reachable template selection.
  - `src/lib/template-blocks.test.ts` — field extraction, labels, per-instance overrides,
    defaults, and isolation.
  - `src/puck/config.test.ts` — fixed/template palette components, dynamic fields,
    and default props.
  - `src/app/api/puck/route.test.ts` — article/page drafts, publishing snapshots,
    legacy showOnFeed compatibility, title uniqueness, access control, validation,
    size limit, and cross-origin rejection with a mocked Payload store.
  - `src/app/api/puck/templates/route.test.ts` — list/load/create/update reusable blocks,
    modes, duplicate names, template immutability, validation, access control,
    cross-origin rejection, and self/indirect cycle rejection.
- `npm run build` passes.
- Manual checks against local MongoDB: create article/page drafts, publish,
  edit draft without changing live content, unpublish, legacy rows without `kind`,
  employee read/draft-denied, preview-denied, feed visibility before/after publish,
  converting an article to a page (live feed entry remains until republish),
  merged post/article feed ordering, rendering a published page that embeds a
  reusable block, live fixed-block edits, and two pages using one template block
  with different per-instance content. Also verified duplicate block names and
  duplicate page titles return 409, template-block `PUT` returns 409, and saving
  a changed template as a new block leaves existing pages on the old block. Published
  pages only serialize the reusable blocks they reference, not every block in the collection.

- Master layout pages (admin-only): `layout` kind, `Frame` component with slots, `layoutSlug` reference, content injection at render time, `npm run seed:admin`.

- CompanyFeed now renders full posts (body, reactions, comments) and article previews with “ganzen Artikel lesen” links; `/api/feed` supports `departments`, `users`, `tags` filtering.

## Known gaps

- No revision history, scheduled publishing, approval workflow, or audit log.
- Reusable blocks have no delete UI. Fixed blocks are live shared components; template
  blocks save structural changes as new blocks and leave old instances untouched.
  Per-instance editing covers only base-component `text`/`textarea` fields.
- `kind` is chosen in the editor; `showOnFeed`/`publishedShowOnFeed` remain as
  compatibility snapshots. Direct API callers that omit both default a new document
  to `page`.
- No optimistic concurrency control; last write wins between concurrent editors.
- No browser/e2e tests (Puck editor interactions are not covered).
- Payload admin is still not wired to OIDC (existing starter limitation).
