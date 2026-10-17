import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

describe('authenticated home and paths dashboard source contract', () => {
  it('shows the owned-paths dashboard on home when authenticated', () => {
    const home = readFileSync(join(root, 'src/app/page.tsx'), 'utf8');
    assert.match(home, /useSession/);
    assert.match(home, /status === 'authenticated'/);
    assert.match(home, /OwnedPathsDashboard/);
    assert.match(home, /DemoPathLanding/);
    assert.match(home, /PublicLanding/);
  });

  it('lists existing paths on /paths and creates on /paths/new', () => {
    const pathsPage = readFileSync(
      join(root, 'src/app/paths/page.tsx'),
      'utf8'
    );
    const createPage = readFileSync(
      join(root, 'src/app/paths/new/page.tsx'),
      'utf8'
    );
    const dashboard = readFileSync(
      join(root, 'src/components/OwnedPathsDashboard.tsx'),
      'utf8'
    );

    assert.match(pathsPage, /OwnedPathsDashboard/);
    assert.doesNotMatch(pathsPage, /Create and research/);
    assert.doesNotMatch(pathsPage, /handleCreate/);

    assert.match(createPage, /What do you want to learn\?/);
    assert.match(createPage, /Create and research/);
    assert.match(createPage, /method: 'POST'/);
    assert.match(createPage, /\/api\/paths/);
    assert.match(createPage, /PATH_REGENERATE_FROM_QUERY_PARAM/);
    assert.match(createPage, /Regenerate path/);

    assert.match(dashboard, /Create new path/);
    assert.match(dashboard, /href="\/paths\/new"/);
    assert.match(dashboard, /path\.display_path/);
    assert.match(dashboard, /path\.display_objective/);
    assert.match(dashboard, /No paths yet/);
    assert.match(dashboard, /Could not load paths/);
    assert.doesNotMatch(dashboard, /Create and research/);
  });
});
