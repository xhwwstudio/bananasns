#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * SQLite (live Express) → MySQL/MariaDB (server-nest) 数据迁移。
 *
 * 设计目标（见 j-production-authorization 内存）：
 *  - 可重复执行（幂等）：每行用 INSERT ... ON DUPLICATE KEY UPDATE，重跑只覆盖、不重复。
 *  - 不丢数据：逐表把 SQLite 真实数据搬到 MySQL；列按两边交集对齐（容忍 schema 细微差异）。
 *  - 安全：只读打开 SQLite；迁移后把每个自增表的 AUTO_INCREMENT 顶到 max(id)+1，
 *    避免切换后新注册撞已迁 id。
 *  - 表/列自适应：只迁“两边都存在”的表与列；缺失的安全跳过并在报告里说明（不静默）。
 *
 * 用法（在服务器上跑，需能同时 require better-sqlite3 与 mysql2）：
 *   NODE_PATH=/home/tt/bananasns/server/node_modules:/home/tt/bananasns-nest/node_modules \
 *   SQLITE_PATH=/home/tt/bananasns/server/data/bananasns.db \
 *   DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=bananasns DB_PASSWORD=*** DB_NAME=bananasns \
 *   node migrate-sqlite-to-mysql.js [--dry]
 *
 * --dry：只统计每表将迁移的行数，不写库。
 */
const path = require('path');
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');

const DRY = process.argv.includes('--dry');
const SQLITE_PATH =
  process.env.SQLITE_PATH || path.resolve(__dirname, '../../server/data/bananasns.db');
const DB_NAME = process.env.DB_NAME || 'bananasns';
const BATCH = 200;

function colName(r) {
  return r.c || r.COLUMN_NAME || r.column_name;
}
function tabName(r) {
  return r.t || r.TABLE_NAME || r.table_name;
}

async function main() {
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`MySQL : ${process.env.DB_HOST}:${process.env.DB_PORT}/${DB_NAME}${DRY ? '  [DRY RUN]' : ''}`);

  const sdb = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });
  const my = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'bananasns',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
    multipleStatements: false,
  });

  const sqliteTables = sdb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => r.name);

  const [myTabRows] = await my.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
    [DB_NAME],
  );
  const myTables = new Set(myTabRows.map(tabName));

  if (!DRY) await my.query('SET FOREIGN_KEY_CHECKS=0');

  const report = [];
  const autoIncTables = []; // {table, maxId}

  for (const table of sqliteTables) {
    if (!myTables.has(table)) {
      report.push({ table, status: 'SKIP · MySQL 无此表', src: '-', migrated: '-' });
      continue;
    }

    const sCols = sdb.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    const [myColRows] = await my.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema=? AND table_name=?',
      [DB_NAME, table],
    );
    const myCols = new Set(myColRows.map(colName));
    const cols = sCols.filter((c) => myCols.has(c));
    const droppedCols = sCols.filter((c) => !myCols.has(c));
    if (!cols.length) {
      report.push({ table, status: 'SKIP · 无共同列', src: '-', migrated: '-' });
      continue;
    }

    const srcRows = sdb
      .prepare(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM "${table}"`)
      .all();
    const srcCount = srcRows.length;
    const note = droppedCols.length ? ` (跳过列: ${droppedCols.join(',')})` : '';

    if (!srcCount) {
      report.push({ table, status: `空${note}`, src: 0, migrated: 0 });
      continue;
    }
    if (DRY) {
      report.push({ table, status: `将迁移${note}`, src: srcCount, migrated: '-' });
      if (cols.includes('id')) autoIncTables.push(table);
      continue;
    }

    const colList = cols.map((c) => `\`${c}\``).join(',');
    const updateClause = cols.map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(',');
    let done = 0;
    for (let i = 0; i < srcRows.length; i += BATCH) {
      const chunk = srcRows.slice(i, i + BATCH);
      const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
      const values = [];
      for (const r of chunk) for (const c of cols) values.push(r[c] === undefined ? null : r[c]);
      const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateClause}`;
      await my.query(sql, values);
      done += chunk.length;
    }
    report.push({ table, status: `已迁移${note}`, src: srcCount, migrated: done });
    if (cols.includes('id')) autoIncTables.push(table);
  }

  // 顶高自增计数器，避免切换后新行撞已迁 id
  if (!DRY) {
    for (const table of autoIncTables) {
      const [[{ maxId }]] = await my.query(
        `SELECT COALESCE(MAX(id),0) AS maxId FROM \`${table}\``,
      );
      await my.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ${Number(maxId) + 1}`);
    }
    await my.query('SET FOREIGN_KEY_CHECKS=1');
  }

  console.table(report);
  const totalSrc = report.reduce((a, r) => a + (typeof r.src === 'number' ? r.src : 0), 0);
  const totalMig = report.reduce((a, r) => a + (typeof r.migrated === 'number' ? r.migrated : 0), 0);
  console.log(`合计 源行=${totalSrc} 已迁=${totalMig}${DRY ? ' (dry)' : ''}; 自增已重置表=${autoIncTables.length}`);

  await my.end();
  sdb.close();
}

main().catch((e) => {
  console.error('迁移失败:', e);
  process.exit(1);
});
