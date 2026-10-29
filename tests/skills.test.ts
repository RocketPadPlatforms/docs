import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Entry {
  name: string;
  version: string;
  files: string[];
}

const catalog: { skills: Entry[] } = JSON.parse(readFileSync('skills/index.json', 'utf8'));

describe('skills catalog (served from raw.githubusercontent.com/.../main/skills/)', () => {
  it('has at least one skill', () => {
    expect(catalog.skills.length).toBeGreaterThan(0);
  });

  it.each(catalog.skills)('$name is a well-formed catalog entry', (entry) => {
    expect(entry.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(entry.name.length).toBeLessThanOrEqual(64);
    // OpenCode refreshes its cache when the version changes: a counter, bumped on every edit
    expect(entry.version).toMatch(/^[1-9]\d*$/);
    expect(entry.files).toContain('SKILL.md');
    for (const file of entry.files) {
      expect(file, 'same-origin relative path').not.toMatch(/^\/|\.\.|:|\\/);
      expect(existsSync(join('skills', entry.name, file)), `${entry.name}/${file}`).toBe(true);
    }
  });

  it.each(catalog.skills)(
    '$name has a description, or it is never offered to the model',
    (entry) => {
      const text = readFileSync(join('skills', entry.name, 'SKILL.md'), 'utf8');
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
      expect(front).toMatch(/^name: \S/m);
      expect(front).toMatch(/^description: \S/m);
    },
  );

  it.each(catalog.skills)('$name only references files it ships', (entry) => {
    const text = readFileSync(join('skills', entry.name, 'SKILL.md'), 'utf8');
    for (const [, ref] of text.matchAll(/(references\/[\w./-]*[\w-])/g)) {
      expect(entry.files, `SKILL.md mentions ${ref}`).toContain(ref);
    }
  });
});
