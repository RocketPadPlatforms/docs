import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addRelease,
  appAFiles,
  createStandardFixtures,
  deleteTag,
  moveTag,
  revParse,
} from '../../tests/helpers/fixtures';
import { type AppConfig, parseSources } from './config';
import { emptyLock, type Lock, serializeLock } from './lock';
import { LocalGitProvider } from './providers/local-git';
import type { Candidate, Provider } from './providers/types';
import { runSync, syncApp } from './sync';

const appCfg = (over: Partial<AppConfig> = {}): AppConfig =>
  parseSources({
    apps: [
      {
        id: 'app-a',
        label: 'A',
        description: 'd',
        repo: 'o/app-a',
        docsPath: 'docs',
        ...over,
      },
    ],
  }).apps[0];

/** In-memory provider: tag -> commit. */
class FakeProvider implements Provider {
  constructor(
    public tags: Record<string, string>,
    public candidates: Candidate[] = Object.keys(tags).map((tag) => ({
      tag,
      publishedAt: '2026-01-01T00:00:00Z',
    })),
  ) {}
  async getDefaultBranch() {
    return 'main';
  }
  async listCandidates() {
    return this.candidates;
  }
  async resolveCommit(_repo: string, tag: string) {
    if (!(tag in this.tags)) throw new Error('missing');
    return this.tags[tag];
  }
  async commitDate() {
    return '2026-02-02T00:00:00Z';
  }
  releaseUrl(repo: string, tag: string) {
    return `https://example.test/${repo}/${tag}`;
  }
}

const sha = (c: string) => c.repeat(40);

describe('syncApp (fake provider)', () => {
  it('locks matching tags, newest first, using the first capture group', async () => {
    const p = new FakeProvider({
      'v0.1.0': sha('a'),
      'v0.10.0': sha('b'),
      'v0.2.0': sha('c'),
      nope: sha('d'),
    });
    const res = await syncApp(appCfg(), undefined, p);
    expect(res.app.versions.map((v) => v.version)).toEqual(['0.10.0', '0.2.0', '0.1.0']);
    expect(res.app.versions[0]).toMatchObject({ tag: 'v0.10.0', commit: sha('b') });
    expect(res.warnings).toEqual([]);
  });

  it('rejects unsafe or reserved version names with a warning', async () => {
    const p = new FakeProvider({ 'rel/1.0.0': sha('a'), current: sha('b'), 'v1.0.0': sha('c') });
    const res = await syncApp(appCfg({ tagPattern: '^(?:v|rel/)?(.+)$' }), undefined, p);
    expect(res.app.versions.map((v) => v.version)).toEqual(['1.0.0']);
    expect(res.warnings.join('\n')).toMatch(/current.*reserved/);
  });

  it('applies minVersion silently for never-published versions', async () => {
    const p = new FakeProvider({ 'v0.0.9': sha('a'), 'v0.1.0': sha('b') });
    const res = await syncApp(appCfg({ minVersion: '0.1.0' }), undefined, p);
    expect(res.app.versions.map((v) => v.version)).toEqual(['0.1.0']);
    expect(res.app.retired).toEqual([]);
  });

  it('exclude moves a version to retired with the nearest newer successor', async () => {
    const p = new FakeProvider({ 'v0.1.0': sha('a'), 'v0.2.0': sha('b'), 'v0.3.0': sha('c') });
    const res = await syncApp(appCfg({ exclude: ['0.2.0'] }), undefined, p);
    expect(res.app.versions.map((v) => v.version)).toEqual(['0.3.0', '0.1.0']);
    expect(res.app.retired).toEqual([{ version: '0.2.0', successor: '0.3.0' }]);
  });

  it('excluding the newest version retires it towards the latest kept one', async () => {
    const p = new FakeProvider({ 'v0.1.0': sha('a'), 'v0.2.0': sha('b') });
    const res = await syncApp(appCfg({ exclude: ['v0.2.0'] }), undefined, p);
    expect(res.app.retired).toEqual([{ version: '0.2.0', successor: '0.1.0' }]);
  });

  it('latest-patch-per-minor retires older patches', async () => {
    const p = new FakeProvider({
      'v0.1.0': sha('a'),
      'v0.1.1': sha('b'),
      'v0.1.2': sha('c'),
      'v0.2.0': sha('d'),
    });
    const res = await syncApp(appCfg({ retention: 'latest-patch-per-minor' }), undefined, p);
    expect(res.app.versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.2']);
    expect(res.app.retired).toEqual([
      { version: '0.1.1', successor: '0.1.2' },
      { version: '0.1.0', successor: '0.1.2' },
    ]);
  });

  it('keeps the locked commit and warns when a tag moved', async () => {
    const first = await syncApp(appCfg(), undefined, new FakeProvider({ 'v0.1.0': sha('a') }));
    const res = await syncApp(appCfg(), first.app, new FakeProvider({ 'v0.1.0': sha('f') }));
    expect(res.app.versions[0].commit).toBe(sha('a'));
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/now points to/);
    expect(res.added).toEqual([]);
  });

  it('never drops a vanished version: keeps it and warns', async () => {
    const first = await syncApp(
      appCfg(),
      undefined,
      new FakeProvider({ 'v0.1.0': sha('a'), 'v0.2.0': sha('b') }),
    );
    const res = await syncApp(appCfg(), first.app, new FakeProvider({ 'v0.2.0': sha('b') }));
    expect(res.app.versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.0']);
    expect(res.warnings.join()).toMatch(/0\.1\.0.*no longer exists/);
  });

  it('a re-run on unchanged input is byte-identical', async () => {
    const p = new FakeProvider({ 'v0.1.0': sha('a'), 'v0.2.0': sha('b') });
    const config = parseSources({
      apps: [{ id: 'app-a', label: 'A', description: 'd', repo: 'o/app-a', docsPath: 'docs' }],
    });
    const one = await runSync({ config, lock: emptyLock(), provider: p });
    const two = await runSync({
      config,
      lock: JSON.parse(serializeLock(one.lock)) as Lock,
      provider: p,
    });
    expect(serializeLock(two.lock)).toBe(serializeLock(one.lock));
    expect(two.summary).toContain('No changes.');
  });

  it('--only leaves other apps untouched and rejects unknown ids', async () => {
    const config = parseSources({
      apps: [
        { id: 'app-a', label: 'A', description: 'd', repo: 'o/app-a', docsPath: 'docs' },
        { id: 'app-b', label: 'B', description: 'd', repo: 'o/app-b', docsPath: 'docs' },
      ],
    });
    const p = new FakeProvider({ 'v0.1.0': sha('a') });
    const res = await runSync({ config, lock: emptyLock(), provider: p, only: 'app-b' });
    expect(Object.keys(res.lock.apps)).toEqual(['app-b']);
    await expect(runSync({ config, lock: emptyLock(), provider: p, only: 'zzz' })).rejects.toThrow(
      /no such app/,
    );
  });
});

describe('local-git provider (real git fixtures)', () => {
  let root: string;
  const config = parseSources({
    apps: [
      {
        id: 'app-a',
        label: 'A',
        description: 'd',
        repo: 'RocketPadPlatforms/app-a',
        docsPath: 'docs',
      },
    ],
  });
  const provider = () => new LocalGitProvider(pathToFileURL(root).href);

  beforeAll(async () => {
    root = resolve(mkdtempSync(join(tmpdir(), 'docs-sync-')));
    await createStandardFixtures(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  let lock: Lock;

  it('unwraps annotated tags to the commit', async () => {
    const out = await runSync({ config, lock: emptyLock(), provider: provider() });
    lock = out.lock;
    const v = lock.apps['app-a'].versions;
    expect(v.map((x) => x.version)).toEqual(['0.2.0', '0.1.0']);
    // v0.2.0 is annotated: its commit must equal the peeled commit, not the tag object
    expect(v[0].commit).toBe(await revParse(root, 'RocketPadPlatforms/app-a', 'v0.2.0^{commit}'));
    expect(v[0].commit).not.toBe(await revParse(root, 'RocketPadPlatforms/app-a', 'v0.2.0'));
    expect(lock.apps['app-a'].defaultBranch).toBe('main');
  });

  it('re-running produces no diff', async () => {
    const out = await runSync({ config, lock, provider: provider() });
    expect(serializeLock(out.lock)).toBe(serializeLock(lock));
    expect(out.warnings).toEqual([]);
  });

  it('a new tag changes the lock by exactly that addition', async () => {
    await addRelease(root, 'RocketPadPlatforms/app-a', {
      tag: 'v0.3.0',
      files: appAFiles('0.2.0'),
    });
    const out = await runSync({ config, lock, provider: provider() });
    const before = JSON.parse(serializeLock(lock));
    const after = JSON.parse(serializeLock(out.lock));
    expect(after.apps['app-a'].versions.slice(1)).toEqual(before.apps['app-a'].versions);
    expect(after.apps['app-a'].versions[0].version).toBe('0.3.0');
    expect(after.apps['app-a'].retired).toEqual([]);
    lock = out.lock;
  });

  it('a moved tag warns and the locked commit survives', async () => {
    const locked = lock.apps['app-a'].versions.find((v) => v.version === '0.1.0')?.commit;
    await moveTag(root, 'RocketPadPlatforms/app-a', 'v0.1.0', { 'docs/guide.md': 'rewritten\n' });
    const out = await runSync({ config, lock, provider: provider() });
    expect(out.warnings.join()).toMatch(/0\.1\.0.*now points to/);
    expect(out.lock.apps['app-a'].versions.find((v) => v.version === '0.1.0')?.commit).toBe(locked);
  });

  it('a deleted tag is kept with a warning', async () => {
    await deleteTag(root, 'RocketPadPlatforms/app-a', 'v0.1.0');
    const out = await runSync({ config, lock, provider: provider() });
    expect(out.warnings.join()).toMatch(/0\.1\.0.*no longer exists/);
    expect(out.lock.apps['app-a'].versions.map((v) => v.version)).toContain('0.1.0');
  });
});
