import semver from 'semver';
import type { AppConfig, SourcesConfig } from './config';
import {
  type Lock,
  type LockApp,
  type LockRetired,
  type LockVersion,
  validateVersionName,
} from './lock';
import type { Candidate, Provider } from './providers/types';
import { mapLimit } from './util';

export interface AppSyncResult {
  app: LockApp;
  added: LockVersion[];
  newlyRetired: LockRetired[];
  warnings: string[];
}

const CONCURRENCY = 5;

/** First capture group of tagPattern -> validated version name, one candidate per version. */
function matchCandidates(app: AppConfig, candidates: Candidate[], warnings: string[]) {
  const re = new RegExp(app.tagPattern);
  const found = new Map<string, Candidate>();
  for (const c of [...candidates].sort((a, b) => a.tag.localeCompare(b.tag))) {
    const name = re.exec(c.tag)?.[1];
    if (name === undefined) continue;
    const problem = validateVersionName(name);
    if (problem) {
      warnings.push(`${app.id}: ignoring tag \`${c.tag}\`: version name "${name}" is ${problem}`);
    } else if (found.has(name)) {
      warnings.push(
        `${app.id}: tags \`${found.get(name)?.tag}\` and \`${c.tag}\` both map to ${name}; using the first`,
      );
    } else {
      found.set(name, c);
    }
  }
  return found;
}

/** Newest patch of each major.minor. */
function latestPatchPerMinor(versions: string[]): Set<string> {
  const best = new Map<string, string>();
  for (const v of versions) {
    const key = `${semver.major(v)}.${semver.minor(v)}`;
    const cur = best.get(key);
    if (!cur || semver.gt(v, cur)) best.set(key, v);
  }
  return new Set(best.values());
}

export async function syncApp(
  app: AppConfig,
  previous: LockApp | undefined,
  provider: Provider,
): Promise<AppSyncResult> {
  const warnings: string[] = [];
  const prev: LockApp = previous ?? { defaultBranch: '', versions: [], retired: [] };
  const lockedByVersion = new Map(prev.versions.map((v) => [v.version, v]));

  const defaultBranch = await provider.getDefaultBranch(app.repo);
  const found = matchCandidates(app, await provider.listCandidates(app.repo, app.source), warnings);

  // Every locked version stays, even when its release or tag vanished upstream.
  const names = [...new Set([...lockedByVersion.keys(), ...found.keys()])];
  const resolved = await mapLimit(names, CONCURRENCY, async (name): Promise<LockVersion | null> => {
    const locked = lockedByVersion.get(name);
    const cand = found.get(name);
    if (locked && !cand) {
      warnings.push(
        `${app.id}: ${name}: release or tag \`${locked.tag}\` no longer exists upstream; keeping the locked commit`,
      );
      return locked;
    }
    const tag = (cand as Candidate).tag;
    let commit: string;
    try {
      commit = await provider.resolveCommit(app.repo, tag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (locked) {
        warnings.push(
          `${app.id}: ${name}: cannot resolve tag \`${tag}\` (${msg}); keeping the locked commit`,
        );
        return locked;
      }
      warnings.push(`${app.id}: ${name}: cannot resolve tag \`${tag}\` (${msg}); skipped for now`);
      return null;
    }
    if (locked) {
      if (locked.commit !== commit) {
        warnings.push(
          `${app.id}: ${name}: tag \`${tag}\` now points to ${commit.slice(0, 12)} but ${locked.commit.slice(0, 12)} is locked; keeping the locked commit`,
        );
      }
      return locked;
    }
    const publishedAt =
      (cand as Candidate).publishedAt ?? (await provider.commitDate(app.repo, commit));
    return { version: name, tag, commit, publishedAt };
  });
  const all = resolved.filter((v): v is LockVersion => v !== null);

  // minVersion -> exclude -> retention
  const removed = new Set<string>(); // leave the site and get a redirect
  let kept = all;
  if (app.minVersion) {
    const min = app.minVersion;
    // below minVersion only counts as retired when it was published before
    kept = kept.filter((v) => {
      if (semver.gte(v.version, min)) return true;
      if (lockedByVersion.has(v.version)) removed.add(v.version);
      return false;
    });
  }
  kept = kept.filter((v) => {
    if (!app.exclude.includes(v.version) && !app.exclude.includes(v.tag)) return true;
    removed.add(v.version);
    return false;
  });
  if (app.retention === 'latest-patch-per-minor') {
    const keep = latestPatchPerMinor(kept.map((v) => v.version));
    kept = kept.filter((v) => {
      if (keep.has(v.version)) return true;
      removed.add(v.version);
      return false;
    });
  }
  kept.sort((a, b) => semver.rcompare(a.version, b.version));

  // Retired = previously retired + newly removed, minus anything that is kept again.
  const keptNames = new Set(kept.map((v) => v.version));
  const retiredNames = new Set([...prev.retired.map((r) => r.version), ...removed]);
  for (const n of keptNames) retiredNames.delete(n);

  const retired: LockRetired[] = [];
  if (kept.length === 0) {
    if (retiredNames.size > 0) {
      warnings.push(
        `${app.id}: no versions left, so ${retiredNames.size} retired version(s) cannot redirect`,
      );
    }
  } else {
    const ascending = [...kept].reverse();
    for (const r of [...retiredNames].sort(semver.rcompare)) {
      // nearest newer kept version, else the latest
      const successor = ascending.find((k) => semver.gt(k.version, r)) ?? kept[0];
      retired.push({ version: r, successor: successor.version });
    }
  }

  const prevRetired = new Set(prev.retired.map((r) => r.version));
  return {
    app: { defaultBranch, versions: kept, retired },
    added: kept.filter((v) => !lockedByVersion.has(v.version)),
    newlyRetired: retired.filter((r) => !prevRetired.has(r.version)),
    warnings,
  };
}

export interface SyncOutcome {
  lock: Lock;
  summary: string;
  warnings: string[];
}

export async function runSync(opts: {
  config: SourcesConfig;
  lock: Lock;
  provider: Provider;
  only?: string;
}): Promise<SyncOutcome> {
  const { config, provider, only } = opts;
  if (only && !config.apps.some((a) => a.id === only)) {
    throw new Error(`--only ${only}: no such app in docs-sources.json`);
  }

  const warnings: string[] = [];
  const apps: Lock['apps'] = {};
  const addedLines: string[] = [];
  const retiredLines: string[] = [];

  for (const app of config.apps) {
    const previous = opts.lock.apps[app.id];
    if (only && app.id !== only) {
      if (previous) apps[app.id] = previous;
      continue;
    }
    const res = await syncApp(app, previous, provider);
    apps[app.id] = res.app;
    warnings.push(...res.warnings);
    for (const v of res.added) {
      const url = provider.releaseUrl(app.repo, v.tag);
      addedLines.push(
        `- **${app.id}** ${v.version} (${url ? `[release ${v.tag}](${url})` : `tag \`${v.tag}\``})`,
      );
    }
    for (const r of res.newlyRetired) {
      retiredLines.push(`- **${app.id}** ${r.version} → redirects to ${r.successor}`);
    }
  }

  const configured = new Set(config.apps.map((a) => a.id));
  for (const id of Object.keys(opts.lock.apps)) {
    if (!configured.has(id)) {
      warnings.push(
        `${id}: app is in the lock file but no longer in docs-sources.json; removed from the lock`,
      );
    }
  }

  const section = (title: string, lines: string[]) =>
    lines.length ? [`### ${title}`, '', ...lines, ''] : [];
  const summary = [
    '## Docs version sync',
    '',
    ...(addedLines.length + retiredLines.length + warnings.length === 0 ? ['No changes.', ''] : []),
    ...section('Added versions', addedLines),
    ...section('Moved to retired', retiredLines),
    ...section(
      'Warnings',
      warnings.map((w) => `- ${w}`),
    ),
  ].join('\n');

  return { lock: { apps }, summary, warnings };
}
