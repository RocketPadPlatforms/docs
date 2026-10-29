# Rocket Pad Platforms documentation portal

One [Docusaurus](https://docusaurus.io) site for the docs of several apps, each with its own
repository and release cycle. The portal **pulls** released docs: it never needs write access to
an app repository, and an app release never needs a change here.

```
docs.rpp.gmbh/                    landing page: one card per app, latest version + all versions
docs.rpp.gmbh/<app>/              latest version (a real page, or a redirect to its first doc)
docs.rpp.gmbh/<app>/<version>/    older versions, e.g. /app-a/0.1.0/ (banner + noindex)
```

- Version names never carry a `v` prefix (`v0.2.0` tag → version `0.2.0`).
- Each app has its own version dropdown, visible only on that app's pages.
- Switching versions keeps the same doc if its id exists in the target version, otherwise it lands
  on the start page of that version (Docusaurus behaviour).

## How it works

```
app repos (tags / releases)
      │  schedule (hourly), or workflow_dispatch from an app's release workflow
      ▼
sync-versions.yml ──► PR "bot/docs-version-sync" updating docs-versions.lock.json
      │  pr.yml (required checks: checks + build)
      ▼  merge (manual, or auto-merge)
build-deploy.yml:  fetch  (read token, executes no app code)
                → build  (NO secrets: prepare, docusaurus build, checks)
                → deploy (pages: write, id-token: write)
```

| Step | Script | Notes |
|---|---|---|
| sync | `scripts/sync-versions.ts` | Resolves releases to commit SHAs, writes the lock file. Only the lock file changes. |
| fetch | `scripts/fetch-docs.ts` | Shallow, blob-filtered, sparse checkout **by commit SHA** of `docsPath` + sidebar. Cached forever: commits are immutable. |
| prepare | `scripts/prepare-docs.ts` | Turns fetched sources into Docusaurus' versioned layout, normalizes sidebars, writes `generated/docs-index.json`. |
| build | `docusaurus build` | One docs plugin instance per app. |
| checks | `scripts/check-build.ts`, `check-size.ts` | Sitemap/SEO sanity, output size (warn > 700 MB, fail > 900 MB; Pages allows 1 GB). |

What the build uses is exactly what the lock file says. A tag that moves later does **not** change
the published docs.

### URLs and SEO

- **The latest version is not versioned in the URL.** `/app-a/guide/` stays the same URL through
  every release, so links and search rankings keep accumulating. Older versions live under
  `/app-a/<version>/`, carry the "no longer maintained" banner and `noindex`, and are left out of
  the sitemap.
- A version root without a root doc (no `slug: /`) gets a static redirect page
  (`meta refresh` + `canonical` + `noindex`) to its first sidebar doc. The build fails if a
  redirect target is not a built route.
- **Retired versions** (see below) no longer exist as pages. Their URLs redirect client-side to the
  successor: same sub-path if it exists there, otherwise the successor's start page. GitHub Pages
  answers such URLs with HTTP 404 before the redirect, so search engines drop them over time.
- `trailingSlash: true`. GitHub Pages serves `dir/index.html` and answers `/dir` with a 301 to
  `/dir/`. Emitting slash URLs everywhere (links, canonicals, sitemap) means visitors and crawlers
  never take that extra hop.
- Titles, descriptions and canonicals come from Docusaurus; `robots.txt` points at the sitemap;
  fonts are self-hosted (no third-party request); the landing page carries JSON-LD.
- The legacy `docs.rpp.gmbh/docs/*` URLs are mapped in `legacy-redirects.json` (see
  [Cutover](#cutover-from-platform-docs)).

## Repository layout

```
docs-sources.json          human-edited: which apps, from where, which versions
docs-versions.lock.json    machine-written by the sync script only (committed)
legacy-redirects.json      old /docs/* URLs -> new pages
scripts/                   sync, fetch, prepare, checks, local mode (TypeScript, run with tsx)
plugins/version-routing/   local site plugin: start pages, redirects, assertions
site/                      pure config helpers (plugin instances, DOCS_ONLY, broken-link policy)
src/                       landing page, theme (brand CSS), 404/redirect handling
tests/                     fixtures, end-to-end suite
skills/                    OpenCode skill catalog; bump "version" in skills/index.json on every change
.cache/                    gitignored: fetched sources
<id>_versions.json, <id>_versioned_docs/, <id>_versioned_sidebars/, generated/   gitignored, generated
```

## Configuration

### `docs-sources.json`

```jsonc
{
  "apps": [{
    "id": "app-a",                          // lowercase [a-z0-9-], unique: plugin id and route
    "label": "App A",                       // navbar + landing page
    "description": "Short landing text",
    "repo": "RocketPadPlatforms/app-a",     // all apps must live in the same organization
    "docsPath": "docs",
    "sidebarFile": "docs/sidebars.json",    // optional; see contract below
    "source": "releases",                   // or "tags"
    "tagPattern": "^v?(\\d+\\.\\d+\\.\\d+)$", // first capture group = version name
    "minVersion": "0.1.0",                  // optional
    "exclude": [],                          // versions (or tags) to retire
    "retention": "all"                      // or "latest-patch-per-minor"
  }]
}
```

`releases` reads **published** releases only (no drafts, no prereleases). `tags` takes every tag.
Version names must be plain semver, at most 32 characters, no `/` or `\`, and not `current`.
Tags are resolved to commits through the git refs API with annotated tags unwrapped; the release's
`target_commitish` is never used.

### Holding back, excluding and retiring versions

| Want | Do |
|---|---|
| Ignore versions below X | `minVersion` |
| Remove one version from the site | add it to `exclude` |
| Keep only the newest patch of each minor | `"retention": "latest-patch-per-minor"` |
| Hold back a release that is not ready | leave the release as a draft/prerelease, or add it to `exclude` until it is |
| Bring a retired version back | remove it from `exclude` and sync |

A version removed by `exclude` or `retention` moves to `retired` in the lock file with a
`successor` (the nearest newer version that is kept, else the latest). Its URLs redirect to the
successor. `minVersion` only retires versions that had been published before.

The sync never silently drops anything:

- a locked version whose release or tag vanished upstream stays, with a warning;
- a locked version whose tag now points at another commit keeps the **locked** commit, with a
  warning;
- an unchanged state produces a byte-identical lock file, so no PR is opened.

## Adding an app

1. Make the app repository follow the [contract](#contract-for-app-repositories).
2. Install the `docs-reader` App on it (see [setup](#github-apps-and-secrets)).
3. Add an entry to `docs-sources.json`.
4. Run the **Sync versions** workflow (Actions → Run workflow, optionally with the app id) and merge
   the PR it opens.
5. In the app repository, add the [PR check](#snippets-for-app-repositories) and, optionally, the
   release trigger.
6. If the app replaces old pages, fill in `legacy-redirects.json`.

## Local development

Requirements: Node 24 and pnpm (`packageManager` is pinned; `corepack enable` or the
`pnpm/action-setup` action picks it up).

```bash
pnpm install
pnpm start                                   # needs prepared sources (below)
pnpm dev:local -- app-a=../app-a/docs        # hot reload on a working copy
pnpm dev:local -- app-a=../app-a/docs --build   # production build of only that working copy
pnpm sync:dry                                # what would the sync change?
```

`dev:local` shows the working copy as version `local (unreleased)` next to the released ones and
works without any fetched sources. The sidebar is read once at start: restart after editing it.
`LOCAL_DOCS=app-a=../app-a/docs` is the underlying environment variable.

To run the whole pipeline yourself:

```bash
GITHUB_TOKEN=... pnpm sync              # lock file
DOCS_SOURCES_TOKEN=... pnpm fetch:docs  # sources (not needed for public repos)
pnpm prepare:docs                       # layout
pnpm build && pnpm serve
```

Useful switches:

| Variable | Effect |
|---|---|
| `DOCS_ONLY=app-a@0.2.0,app-b` | build only these (`app` = all versions, `app@current` = working copy). An app with no versions left is omitted. |
| `DOCS_ON_BROKEN_LINKS=warn` | override `throw` for broken links (troubleshooting). |
| `DOCS_GIT_BASE=file:///tmp/fixtures` | resolve `<owner>/<repo>` below a local directory instead of github.com. |
| `DOCS_DEPLOY=true` | set by the deploy workflow; rejects `LOCAL_DOCS` and `DOCS_ONLY`. |

Checks and tests:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

The end-to-end suite builds fixture repositories through sync → fetch → prepare → build and drives a
browser (dropdown visibility on desktop and in the mobile menu, version switching, retired-version
redirects). It needs a Chromium that Playwright can launch:

```bash
nix build nixpkgs#playwright-driver.browsers --no-link --print-out-paths
E2E_CHROMIUM=<out>/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell \
  pnpm test:e2e
# E2E_SKIP_BROWSER=1 skips the browser tests, E2E_KEEP=1 keeps the temp directories
pnpm tsx tests/helpers/make-fixtures.ts /tmp/fixtures   # fixture repos for manual experiments
```

## GitHub Apps and secrets

All tokens are minted per job with `actions/create-github-app-token`, with `owner` and
`repositories` set explicitly and narrowed by `permission-*`. A GitHub App's permissions are
installation-wide; the narrowing is what keeps each token small.

### `docs-reader` (required)

1. Organization → Settings → Developer settings → GitHub Apps → **New GitHub App**. Name
   `rpp-docs-reader`, homepage any URL, **untick** webhook.
2. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**,
   **Metadata: Read** (the write permissions are only used for the sync PR, on this repository,
   through a separate narrow token).
3. "Where can this app be installed": only on this account. Create it.
4. Note the **Client ID** and generate a **private key** (`.pem`).
5. Install it on the organization, selecting **this repository and every app repository**.
6. Store, in this repository (or organization-wide, restricted to this repository):
   - variable `DOCS_READER_CLIENT_ID`
   - secret `DOCS_READER_PRIVATE_KEY` (the whole `.pem`)
7. Optional repository variables:
   - `DOCS_SYNC_AUTO_MERGE=true` — enable auto-merge on the sync PR
   - `DOCS_DEPLOY_ENABLED=true` — allow the deploy job (see [Cutover](#cutover-from-platform-docs))

Which job gets which token:

| Job | Token | Scope |
|---|---|---|
| `fetch` (pr.yml, build-deploy.yml) | read | app repos with locked versions; Contents read, Metadata read |
| `sync` read step | read | all configured app repos; Contents read, Metadata read |
| `sync` PR step | write | this repository only; Contents write, Pull requests write |
| `build` | none | no secrets at all (the job prints its environment variable names) |

### `docs-dispatcher` (optional, instant sync after a release)

1. New GitHub App `rpp-docs-dispatcher`, no webhook, repository permissions **Actions: Read and
   write**, **Metadata: Read**.
2. Install it on **this repository only**.
3. In every app repository store variable `DOCS_DISPATCHER_CLIENT_ID` and secret
   `DOCS_DISPATCHER_PRIVATE_KEY` (or organization-wide, restricted to the app repositories).

App repositories never get a token with Contents write on this repository.

### Repository settings

- Settings → General → **Allow auto-merge** (only if you use `DOCS_SYNC_AUTO_MERGE`).
- Settings → Rules → Rulesets: protect `main`, require a pull request, require status checks
  **`checks`** and **`build`** (both from `pr.yml`, which has no path filters).
- If this repository is private or internal: Settings → Actions → General → Access, allow
  repositories in the organization to use its workflows (the reusable workflow below).

## Runners

Every job runs on `[self-hosted, linux, x64]` because hosted minutes ran out. The runner needs
git and outbound HTTPS; Node and pnpm are installed by the workflows.

Because this repository is public, harden the runner:

- Settings → Actions → General → "Run workflows from fork pull requests": **Require approval for
  all external contributors**. `pr.yml` also skips every job for fork PRs and uses `pull_request`
  only (never `pull_request_target`).
- Put the runner in a **runner group** that only this repository and the app repositories may use.
  Prefer ephemeral runners.

Hosted runners are free for public repositories. When you want them back, merge the pull request
`ci/hosted-runners`, which only changes `runs-on` to `ubuntu-latest`. (`validate-app-docs.yml` runs
in private app repositories, where hosted minutes are billed.)

## Pages and custom domain

1. Settings → Pages → **Source: GitHub Actions**.
2. Organization → Settings → Pages → **Add a domain** `rpp.gmbh`; create the TXT record
   `_github-pages-challenge-RocketPadPlatforms.rpp.gmbh` it shows, wait for DNS, click **Verify**.
   Verifying `rpp.gmbh` also covers `docs.rpp.gmbh`.
3. DNS: `docs.rpp.gmbh  CNAME  rocketpadplatforms.github.io.` (no wildcard records).
4. Repository Settings → Pages → **Custom domain** `docs.rpp.gmbh`, then **Enforce HTTPS** once the
   certificate is issued.

With "GitHub Actions" as the source no `CNAME` file is needed in the build.

### Cutover from `platform-docs`

`docs.rpp.gmbh` is served by `RocketPadPlatforms/platform-docs` today, and a custom domain can be
held by one repository only. The deploy job therefore stays off until you flip it:

1. Split the old content into the app repositories and add the apps to `docs-sources.json`.
2. Fill in `legacy-redirects.json`: every old URL gets `"/<app>/<page>/"` (redirect) or `false`
   (dropped). `null` means undecided and **blocks the deploy** (`pnpm check:legacy`, run by the
   deploy build). Pull requests only warn.
3. Remove the custom domain from `platform-docs` (Settings → Pages), set it here (above).
4. Set the repository variable `DOCS_DEPLOY_ENABLED=true` and re-run **Build and deploy**.
5. Update the "Read the Docs" links on rpp.gmbh (they point at `/docs/overview` and
   `/docs/modules`) and resubmit `https://docs.rpp.gmbh/sitemap.xml` in Search Console.

## Reusable workflow for app repositories

`validate-app-docs.yml` is a reusable workflow (`workflow_call`). It checks out this repository
**explicitly** (the `github` context is the caller's), checks out the app, and builds only that app's
working copy in local mode (`DOCS_ONLY=<app>@current`), skipping all released versions. A broken
link or an MDX error fails the app's PR.

- Inputs: `app-id`, `docs-path`, `central-repo` (default `RocketPadPlatforms/docs`), `central-ref`
  (default `main`); optional secret `central-token` if this repository is private.
- If this repository is **private or internal**, its Actions access policy must allow the app
  repositories to use its workflows.
- A **public** app repository cannot call a reusable workflow from a **private** repository.
- Concurrency is per caller repository, ref and app; it never uses `github.workflow` alone.

### Snippets for app repositories

PR check: copy `skills/rpp-repo-docs/references/docs-workflow.yml` to `.github/workflows/docs.yml`
in the app repository. If it is a required check, do not add `paths:` filters, or the check never
reports on PRs that do not touch the docs.

Optional, sync immediately after a release (the portal syncs hourly anyway). Pin actions to commit
SHAs; the one below is the version this repository uses:

```yaml
# .github/workflows/docs-release.yml
name: Notify docs portal
on:
  release:
    types: [published]
permissions: {}
jobs:
  notify:
    runs-on: [self-hosted, linux, x64]
    permissions: {}
    steps:
      - id: token
        uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
        with:
          client-id: ${{ vars.DOCS_DISPATCHER_CLIENT_ID }}
          private-key: ${{ secrets.DOCS_DISPATCHER_PRIVATE_KEY }}
          owner: RocketPadPlatforms
          repositories: docs
          permission-actions: write
      - env:
          TOKEN: ${{ steps.token.outputs.token }}
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/RocketPadPlatforms/docs/actions/workflows/sync-versions.yml/dispatches \
            -d '{"ref":"main","inputs":{"app":"app-a"}}'
```

**Recommendation:** enable **immutable releases** in the app repositories (Settings → General), so a
published release and its tag can no longer be changed or deleted.

## Contract for app repositories

- **Location:** the docs live in `docsPath`.
- **Assets:** images and files are referenced relatively and live inside the docs folder.
- **Imports and links:** nothing imports or links outside the docs folder. Shared components only
  via `@site/...` (for example `@site/src/components/ClusterLink`, `@site/constants`); they belong
  to the portal and change for **all** versions at once. No symlinks (the fetch step rejects them).
- **Links:** cross-doc links are relative file paths (`./other.md`). A broken link in the latest
  version fails the build; in an older version it only warns (it can only be fixed by a new
  release).
- **Sidebar:** JSON preferred. It must expose a sidebar with id `docs`, or be omitted (then one is
  autogenerated from the folder structure). A single sidebar under another key is renamed to
  `docs`; several sidebars without `docs` are an error naming the app and version. A `sidebars.js`
  or `.ts` is evaluated by the build job (no secrets there), so keep it free of side effects.
- **Doc ids:** keep them stable across versions (set `id` in the front matter when moving a file),
  or the version dropdown cannot map pages between versions.
- **Start page:** give each version a root doc (`index.md`, or `slug: /` in the front matter).
  Without one, the first doc of the `docs` sidebar is used.
- **SEO:** every doc has one H1, a unique title and a `description` in the front matter. Titles
  should name the product; two products both having a page called "Introduction" collide in search
  results (the build warns about duplicate titles).
- **Syntax:** only what the portal enables, because old tags must keep compiling:
  MDX 3 for `.md` and `.mdx` (`format: mdx`) with the MDX 1 compatibility options on (`<!-- -->`
  comments, `:::note` style admonitions, `{#custom-id}` heading ids), Mermaid code fences, emoji
  shortcodes, tabs and the other `@theme/*` components of Docusaurus' classic theme, and Prism
  highlighting (Docusaurus defaults plus `bash` and `hcl`).
- **Fixes:** a docs fix in an already released version means a new patch release.
- **Releases:** use published (non-draft, non-prerelease) releases whose tag matches `tagPattern`;
  enable immutable releases.

## Troubleshooting

**An old tag fails with an MDX error after a Docusaurus upgrade.** Old tags are immutable. Either
fix the rendering in the portal (a remark plugin or component), or add the version to `exclude` so
it is retired and redirects to its successor. Do not enable `future.v4` as a whole or
`mdx1CompatDisabledByDefault`: that changes how existing content compiles.

**`no start page` / `doesn't have anything to be linked to`.** A version has no root doc and its
`docs` sidebar contains no doc. Add `slug: /` to a doc or list one in the sidebar. For the latest
version Docusaurus itself stops the build first (its `docSidebar` navbar item needs a link).

**Missing or odd sidebar.** No sidebar file → autogenerated. `several sidebars (a, b) but none is
named "docs"` → rename one. The configured `sidebarFile` is also looked up as a sibling
`sidebars.{json,js,cjs,mjs,ts}`, which covers an app that switched formats between releases.

**Broken links.** Latest/local: fix the link. Older versions only warn. To get past a stuck build
while investigating: `DOCS_ON_BROKEN_LINKS=warn pnpm build`. Note that Docusaurus' route-level
`onBrokenLinks` cannot tell versions apart, so a broken link in an old tag fails a normal build
unless you override it or `exclude` the version.

**Auth errors in `fetch`.** `docsPath ... does not exist` means the path is wrong at that commit.
`404`/`could not read` means the `docs-reader` installation does not include that repository, or
`DOCS_READER_*` is missing. Tokens are passed to git through scoped environment variables and
redacted from errors; they never appear in logs. The token minted by `create-github-app-token` is
revoked when its job ends, so each job mints its own.

**`ERR_PNPM_IGNORED_BUILDS`.** pnpm blocks dependency build scripts; allowed ones are listed under
`allowBuilds` in `pnpm-workspace.yaml`.

**Output too large (Pages limit 1 GB).** `check:size` warns above 700 MB and fails above 900 MB.
Reduce versions with `retention: latest-patch-per-minor`, `minVersion` or `exclude`, and compress
large images in the app repositories.

**The sync PR did not trigger checks.** Events created with `GITHUB_TOKEN` do not start workflows;
that is why the PR is opened with a `docs-reader` App token. Check the App secrets if it fails.

**Warnings in the sync PR.** `now points to` (moved tag) and `no longer exists upstream` are
warnings only. The locked commit keeps being built; decide whether to cut a new release.

## Search

Not implemented. Options when it is needed:

- **Algolia DocSearch** (`themeConfig.algolia`): best results and zero build cost, but a third
  party receives queries (GDPR), and the crawler must be configured to index only the latest
  version (older ones are `noindex`).
- **A local search plugin** (for example `@easyops-cn/docusaurus-search-local`): no third party,
  index is built at build time and grows with every version; configure it to index the latest
  version only.

## Maintenance notes

- **Docusaurus 3.10.2** is pinned exactly, as is everything else; pnpm enforces a 7 day release
  cooldown (`minimumReleaseAge`). Upgrading means running the e2e suite.
- **Renovate** (`renovate.json`) opens update PRs for npm packages, pnpm and GitHub Actions
  (pinned to commit SHAs with a version comment) once a release is 7 days old.
- `future.faster` is on; `future.v4.removeLegacyPostBuildHeadAttribute` is the only v4 flag, needed
  by Faster's SSG worker threads and not content-related.
- **Experimental / internal API** — only `plugins/version-routing/docs-content.ts` knows the shape
  of the docs plugin's loaded content (`allContentLoaded`, `loadedVersions`); it validates it and
  fails the build with a pointer if it changes. A unit test pins the 3.10.2 shape.
- **Swizzled** — `src/theme/NotFound/Content` (wrap; Docusaurus marks it *unsafe*: it is needed
  because the unversioned latest version captures `/<app>/<retired>/...` in its doc router, which
  renders `NotFound/Content`) and `src/theme/Mermaid` (eject, per-color-mode palette). The version
  dropdown needs no swizzle: `NavbarItem/DocsVersionDropdownNavbarItem` is *unsafe*, and the CSS
  approach works on desktop and in the mobile menu.
- `package.json` must not have `"type": "module"`: Docusaurus' generated files are CommonJS-scoped
  and Rspack leaves `require.resolveWeak` untransformed in strict ESM. Modules loaded by
  `docusaurus.config.ts` use `import * as z from 'zod'` because Docusaurus' bundled jiti drops
  zod's named export under `interopDefault`.
- Scripts are named `fetch:docs` and `prepare:docs`: `pnpm fetch` is a built-in pnpm command and
  `prepare` is an install lifecycle script.

## Commands

| Command | What |
|---|---|
| `pnpm sync` / `pnpm sync:dry` | update / preview the lock file (`--only <app>`) |
| `pnpm fetch:docs` | fetch locked sources (`--only <app>[@version]`, `--concurrency <n>`) |
| `pnpm prepare:docs` | generate the versioned layout |
| `pnpm start` / `pnpm build` / `pnpm serve` | Docusaurus |
| `pnpm dev:local -- app=path` | working copy with hot reload (`--build` for a production build) |
| `pnpm check:build` / `check:size` / `check:legacy` | post-build checks and the deploy gate |
| `pnpm typecheck` / `lint` / `test` / `test:e2e` | quality gates |
