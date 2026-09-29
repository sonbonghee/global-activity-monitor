'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

async function backup(source, destination) {
  const from = path.resolve(source);
  const to = path.resolve(destination);
  if (from === to) throw new Error('백업 경로가 원본 데이터베이스와 같습니다');
  if (!fs.existsSync(from)) throw new Error(`데이터베이스가 없습니다: ${from}`);
  if (fs.existsSync(to)) throw new Error(`백업 파일이 이미 있습니다: ${to}`);
  fs.mkdirSync(path.dirname(to), {recursive:true});
  const db = new Database(from, {readonly:true, fileMustExist:true});
  try {
    await db.backup(to);
  } catch (error) {
    fs.rmSync(to, {force:true});
    throw error;
  } finally {
    db.close();
  }
  try {
    const copy = new Database(to, {readonly:true, fileMustExist:true});
    try {
      if (copy.pragma('quick_check', {simple:true}) !== 'ok') throw new Error('백업 무결성 검사 실패');
    } finally {
      copy.close();
    }
  } catch (error) {
    fs.rmSync(to, {force:true});
    throw error;
  }
  return to;
}

if (require.main === module) {
  const destination = process.argv[2];
  if (!destination) {
    console.error('사용법: npm run backup -- /app/data/backups/monitor-YYYYMMDD.db');
    process.exitCode = 1;
  } else {
    backup(process.env.DB_PATH || path.join(__dirname,'..','monitor.db'), destination)
      .then(file => console.log(`백업 완료: ${file}`))
      .catch(error => { console.error(`백업 실패: ${error.message}`); process.exitCode = 1; });
  }
}
module.exports = {backup};
