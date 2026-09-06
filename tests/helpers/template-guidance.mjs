import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Verify resources and links in an independent generated project. */
export async function assertTemplateGuidance(root) {
  const names = ['bonko-template-author', 'bonko-template-verify'];
  assert.deepEqual((await readdir(path.join(root, '.agents/skills'))).sort(), names);
  const entries = ['AGENTS.md', 'README.md'];
  for (const name of names) {
    const relative = `.agents/skills/${name}/SKILL.md`;
    const content = await readFile(path.join(root, relative), 'utf8');
    assert.ok(content.startsWith(`---\nname: ${name}\ndescription: `));
    assert.match(content, /\.\.\/\.\.\/\.\.\/DEVELOPMENT\.md/);
    entries.push(relative);
  }
  for (const relative of entries) {
    const content = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(content, /https?:.*template-studio/);
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = path.resolve(root, path.dirname(relative), match[1]);
      assert.ok(target.startsWith(root + path.sep), `Link escapes project: ${match[1]}`);
      await access(target);
    }
  }
  const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  for (const name of names) assert.ok(agents.includes(`.agents/skills/${name}/SKILL.md`));
  assert.match(await readFile(path.join(root, 'DEVELOPMENT.md'), 'utf8'), /protocol v3/);
}
