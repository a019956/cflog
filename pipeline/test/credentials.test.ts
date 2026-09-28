import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readServiceAccount } from '../src/publish/firestore.js';

const KEY = {
  project_id: 'p',
  client_email: 'x@p.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
};

describe('readServiceAccount', () => {
  it('reads the key JSON from the env var or from a file', () => {
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(KEY) })).toMatchObject({
      project_id: 'p',
    });
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'cflog-sa-')), 'key.json');
    writeFileSync(file, JSON.stringify(KEY));
    expect(readServiceAccount({ FIREBASE_SERVICE_ACCOUNT_FILE: file })).toMatchObject({
      client_email: KEY.client_email,
    });
  });
  it('explains the common mistakes', () => {
    expect(() => readServiceAccount({})).toThrow(/No Firebase credentials/);
    expect(() =>
      readServiceAccount({
        FIREBASE_SERVICE_ACCOUNT: 'firebase-adminsdk-fbsvc@cflog-a5850.iam.gserviceaccount.com',
      }),
    ).toThrow(/email, not its key/);
    expect(() => readServiceAccount({ FIREBASE_SERVICE_ACCOUNT_FILE: '/nope/key.json' })).toThrow(
      /not found/,
    );
    expect(() => readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: '{"project_id":"p"}' })).toThrow(
      /missing private_key/,
    );
  });
});
