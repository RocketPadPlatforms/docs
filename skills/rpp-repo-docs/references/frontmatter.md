# Front matter and page conventions

## Template

```md
---
title: Install App A on Kubernetes
sidebar_label: Installation
description: Install App A on an existing Kubernetes cluster with Helm, step by step.
---

Short introduction: what the reader will have at the end of this page.

## Prerequisites

...
```

Here the page has no `# Heading`: Docusaurus renders `title` as the H1. If you prefer to write
the H1 yourself, do it as the first heading and keep `title` identical; never both a rendered
title and a `# Heading` that differs.

## Fields

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Becomes the H1 (when there is none), the browser title and the search-result title. **Unique across all RPP products**: name the product where it would otherwise be generic ("Install App A", not "Installation"). |
| `description` | yes | 1-2 plain sentences, becomes the meta description. No Markdown. |
| `sidebar_label` | no | Short label for the sidebar; defaults to `title`. |
| `id` | no | Replaces the file-name part of the doc id (folder prefix stays). Cannot contain `/`. Use it to keep an id when renaming a file in the same folder. |
| `slug` | start page, or to keep a URL after a move | `slug: /` on `docs/index.md`. Elsewhere avoid it: the URL follows the path. |
| `keywords` | no | Only when it adds real search terms. |
| `draft` | no | `draft: true` pages are left out of the published build. |

## The start page

```md
---
slug: /
title: App A documentation
description: Documentation for App A: installation, concepts, how-to guides and reference.
---

What App A is and who it is for, in two or three sentences.

- [Get started](./getting-started/index.md)
- [Concepts](./concepts/index.md)
- [Guides](./guides/index.md)
- [Reference](./reference/index.md)
```

Every version has its own start page; it is where visitors land when a page does not exist in the
version they switch to.

## Links and assets

```md
[Install](./installation.md)
[Ports](../reference/configuration.md#ports)
![Architecture](../assets/architecture.svg)
```

- Relative path, file extension included. A broken link in the **latest** version fails the
  portal build; in an older version it only warns (it can only be fixed by a new release).
- Anchors come from headings (`## Ports`) or an explicit id (`## Ports {#ports}`).

## Partials

```mdx
---
title: Requirements
description: What you need before installing App A.
---

import Requirements from '../_partials/_requirements-table.mdx';

<Requirements />
```

Partials live in `docs/_partials/` with a file name starting with `_`; they are not published as
pages.

## Things that break the build

- A bare `{` or `<` in prose (MDX tries to parse it). Escape (`\{`, `&lt;`) or use a code span.
- An unclosed HTML tag (`<br>` must be `<br />`).
- An import from outside `docs/`, or a symlink.
- A sidebar entry whose doc id does not exist (check the folder prefix).
- Two sidebars without one named `docs`.
