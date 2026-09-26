import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractYouTubeVideoId,
  progressSchema,
  validateInput,
} from './validation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('validateInput / progressSchema', () => {
  it('accepts valid progress payloads', () => {
    const result = validateInput(progressSchema, {
      playlistId: 'PLabcdefghijklmnopqrstuv',
      videoId: 'dQw4w9WgXcQ',
      watched: true,
    });
    assert.equal(result.success, true);
  });

  it('rejects invalid video ids', () => {
    const result = validateInput(progressSchema, {
      playlistId: 'PLabcdefghijklmnopqrstuv',
      videoId: 'short',
      watched: false,
    });
    assert.equal(result.success, false);
  });
});

describe('extractYouTubeVideoId', () => {
  it('parses watch and youtu.be urls', () => {
    assert.equal(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
  });
});

describe('server-only boundary', () => {
  it('keeps service-role configuration out of browser-safe supabase-public', () => {
    const source = readFileSync(
      join(root, 'src/lib/supabase-public.ts'),
      'utf8'
    );
    assert.equal(source.includes('SERVICE_ROLE'), false);
    assert.equal(source.includes('server-only'), false);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_/);
  });

  it('marks config and supabase clients as server-only', () => {
    for (const relativePath of [
      'src/lib/config.ts',
      'src/lib/supabase.ts',
      'src/lib/auth.ts',
      'src/lib/api-auth.ts',
    ]) {
      const source = readFileSync(join(root, relativePath), 'utf8');
      assert.match(
        source,
        /import 'server-only'/,
        `${relativePath} must import server-only`
      );
    }
  });

  it('does not export a browser supabase client from the server module', () => {
    const source = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
    assert.equal(/^export const supabase\b/m.test(source), false);
    assert.match(source, /createServerSupabaseClient/);
    assert.match(source, /serviceRoleKey/);
  });
});

describe('security headers config', () => {
  it('declares security headers for all public paths in next.config.js', () => {
    const source = readFileSync(join(root, 'next.config.js'), 'utf8');
    assert.match(source, /X-Frame-Options/);
    assert.match(source, /Content-Security-Policy/);
    assert.match(source, /source:\s*'\/:path\*'/);
  });
});

describe('private table hardening migration', () => {
  it('enables deny-by-default RLS and service_role grants', () => {
    const source = readFileSync(
      join(
        root,
        'supabase/migrations/20260926140000_harden_private_table_rls_grants.sql'
      ),
      'utf8'
    );
    assert.match(source, /playlist_item_edits/);
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(source, /REVOKE ALL ON TABLE/);
    assert.match(source, /GRANT ALL ON TABLE .* TO service_role/);
  });
});
