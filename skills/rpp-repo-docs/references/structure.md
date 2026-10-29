# Recommended structure for app docs

The layout follows [Diataxis](https://diataxis.fr): each page has one job, so readers (and search
engines) know what a page is for.

```
docs/
├── index.md                  # start page of every version (slug: /)
├── sidebars.json             # one sidebar named "docs"
├── getting-started/
│   ├── index.md              # category landing page
│   ├── requirements.md
│   ├── installation.md
│   └── quick-start.md
├── concepts/                 # explanation: what it is and why
│   ├── index.md
│   └── architecture.md
├── guides/                   # how-to: one task per page
│   ├── index.md
│   ├── upgrade.md
│   └── backup-and-restore.md
├── reference/                # facts: configuration, CLI, API, compatibility
│   ├── index.md
│   ├── configuration.md
│   └── cli.md
├── troubleshooting.md
├── release-notes.md          # optional; the changelog stays the source of truth
├── _partials/                # starts with "_": importable snippets, not pages
│   └── _requirements-table.mdx
└── assets/                   # images and downloads, referenced relatively
    └── architecture.svg
```

## Why this shape

- **`index.md` at every level** gives each sidebar category a real page. Categories link to it
  (`"link": {"type": "doc", "id": "guides/index"}`), which keeps URLs stable when a category is
  renamed.
- **Four sections, not more.** Small products can start with just `getting-started`, `guides`,
  `reference`. Add `concepts` when a page explains rather than instructs.
- **Task-named guides** (`upgrade.md`, `backup-and-restore.md`), not feature-named. One task per
  page keeps pages short and link-able.
- **Reference is lookup material:** tables, defaults, flags. No narrative; link to a concept or
  guide page for the why and how.

## Naming and URLs

- Lowercase, hyphenated file names (`backup-and-restore.md`). The URL follows the path:
  `docs/guides/upgrade.md` is `https://docs.rpp.gmbh/<app-id>/guides/upgrade/`.
- The doc id is `guides/upgrade`. Keep ids stable across releases (see the hard rules in
  `SKILL.md`); the version dropdown depends on it.
- Do not put the app or version name into paths or file names. The portal already adds the app id
  and the version to the URL.

## Page checklist

- Front matter with `title`, `description` (and optional `sidebar_label`).
- Exactly one H1; headings do not skip levels.
- Relative links with file extension; images with alt text.
- Commands in fenced blocks with a language (`bash`, `yaml`, `hcl`, ...).
- Under about 1500 words; otherwise split.

## Starting from an existing README

Do not move the whole README into one page. Split it by job: install steps go to
`getting-started/installation.md`, option tables to `reference/configuration.md`, "how do I..."
sections to `guides/`. Keep a short README that links to https://docs.rpp.gmbh/<app-id>/.
