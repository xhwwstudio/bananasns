import { describe, expect, test } from 'vitest';
import { buildObjectKey } from '../src/modules/storage/storage-key';

describe('buildObjectKey COS 对象分层', () => {
  test('默认 uploads/年/月/ 前缀，保留扩展名', () => {
    const key = buildObjectKey('photo.JPG', new Date('2026-11-05T12:00:00Z'), 'abc123');
    expect(key).toBe(`uploads/2026/11/${new Date('2026-11-05T12:00:00Z').getTime()}-abc123.JPG`);
  });

  test('按月切分使用 Asia/Shanghai，月初凌晨不会落到上个月', () => {
    // UTC 2026-10-31 16:30 = 上海 2026-11-01 00:30
    const key = buildObjectKey('a.png', new Date('2026-10-31T16:30:00Z'), 'r1');
    expect(key).toMatch(/^uploads\/2026\/11\/\d+-r1\.png$/);
  });

  test('无扩展名、自定义前缀、前缀斜杠清理', () => {
    expect(buildObjectKey('README', new Date('2026-01-01T00:00:00Z'), 'r2', '/media/'))
      .toMatch(/^media\/2026\/01\/\d+-r2$/);
  });

  test('同一毫秒不同随机串不冲突', () => {
    const d = new Date('2026-11-05T12:00:00Z');
    expect(buildObjectKey('x.png', d, 'a')).not.toBe(buildObjectKey('x.png', d, 'b'));
  });
});
