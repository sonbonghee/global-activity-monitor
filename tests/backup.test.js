'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const {backup} = require('../scripts/backup');

test('online backup includes committed WAL rows and refuses overwrite', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'monitor-backup-'));
  const source = path.join(directory,'monitor.db');
  const target = path.join(directory,'backups','snapshot.db');
  const live = new Database(source);
  try {
    live.pragma('journal_mode = WAL');
    live.exec('CREATE TABLE korean_items(id TEXT PRIMARY KEY); INSERT INTO korean_items VALUES (\'latest\');');
    await backup(source,target);
    const restored = new Database(target,{readonly:true});
    try { assert.equal(restored.prepare('SELECT id FROM korean_items').get().id,'latest'); }
    finally { restored.close(); }
    await assert.rejects(backup(source,target),/이미 있습니다/);
  } finally {
    live.close();
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
