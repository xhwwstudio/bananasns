import { describe, expect, test } from 'vitest';
import { parseSocialQr, emptySocialQr } from '../src/modules/site/social-qr';

describe('parseSocialQr 右栏二维码配置', () => {
  test('空值 → 默认四个平台、空二维码', () => {
    const c = parseSocialQr('');
    expect(c.groupTitle).toBe('扫码进聊天群');
    expect(c.items.map((i) => i.key)).toEqual(['xiaohongshu', 'douyin', 'weibo', 'channels']);
    expect(c.items.every((i) => !i.qr)).toBe(true);
  });

  test('保留合法 QR/主页链接，拒绝 javascript:', () => {
    const c = parseSocialQr(JSON.stringify({
      groupTitle: '官方群', groupText: '扫码进群', groupQr: 'https://cdn.example.com/g.png',
      items: [
        { key: 'xiaohongshu', qr: 'https://cdn.example.com/x.png', url: 'https://xhslink.com/a', search: '搜索“一颗大™”' },
        { key: 'douyin', qr: 'javascript:alert(1)', url: 'javascript:alert(2)' },
        { key: 'weibo', qr: '/uploads/w.png', url: '/u/weibo' },
        { key: 'unknown', qr: 'https://x' },
      ],
    }));
    expect(c.groupQr).toBe('https://cdn.example.com/g.png');
    expect(c.items[0].qr).toContain('x.png');
    expect(c.items[0].url).toBe('https://xhslink.com/a');
    expect(c.items[0].search).toBe('搜索“一颗大™”');
    expect(c.items[1].qr).toBe('');
    expect(c.items[1].url).toBe('');
    expect(c.items[2].qr).toBe('/uploads/w.png');
    expect(c.items).toHaveLength(4);
  });

  test('坏 JSON 回退默认，不抛异常', () => {
    expect(parseSocialQr('{broken')).toEqual(emptySocialQr());
  });
});
