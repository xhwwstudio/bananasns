import { beforeEach, describe, expect, test } from 'vitest';
import { checkSensitive, sensitiveMatcherSize, setSensitiveConfig } from '../src/common/sensitive';
import { parseSensitiveWords, normalizeUploadFilename } from '../src/common/sensitive-words';

describe('sensitive-stop-words 文件解析', () => {
  test('逗号分隔（色情类/政治类格式）', () => {
    expect(parseSensitiveWords('爱液,\n按摩棒,\n爆草,')).toEqual(['爱液', '按摩棒', '爆草']);
  });

  test('每行一词（广告/网址/stopword.dic 格式）', () => {
    expect(parseSensitiveWords('广告词一\n广告词二\n\n# 注释\n')).toEqual(['广告词一', '广告词二']);
  });

  test('中文逗号、顿号、分号混排 + 去重', () => {
    expect(parseSensitiveWords('禁词甲，禁词乙、禁词甲；禁词丙')).toEqual(['禁词甲', '禁词乙', '禁词丙']);
  });
});

describe('normalizeUploadFilename 中文文件名乱码', () => {
  test('busboy latin1 乱码还原为 UTF-8 中文', () => {
    const mojibake = Buffer.from('色情词库.txt', 'utf8').toString('latin1');
    expect(normalizeUploadFilename(mojibake)).toBe('色情词库.txt');
  });

  test('正常中文/ASCII 文件名不变', () => {
    expect(normalizeUploadFilename('色情词库.txt')).toBe('色情词库.txt');
    expect(normalizeUploadFilename('COVID-19.txt')).toBe('COVID-19.txt');
  });

  test('去掉路径与控制字符', () => {
    expect(normalizeUploadFilename('C:\\tmp\\广告.txt')).toBe('广告.txt');
  });
});

describe('敏感词文件词库接入 Aho-Corasick', () => {
  beforeEach(() => setSensitiveConfig('1', ''));

  test('第三个参数（文件词库）参与匹配', () => {
    setSensitiveConfig('1', '', ['文件违禁词', '另一个词']);
    expect(checkSensitive('这里有文件违禁词')).toBe('文件违禁词');
    expect(sensitiveMatcherSize()).toBeGreaterThan(4);
  });

  test('内置 + 自定义 + 文件词库同时生效', () => {
    setSensitiveConfig('1', '自定义词', ['文件词']);
    expect(checkSensitive('傻逼')).toBe('傻逼');
    expect(checkSensitive('自定义词')).toBe('自定义词');
    expect(checkSensitive('文件词')).toBe('文件词');
  });

  test('文件词同样忽略空格/符号/大小写', () => {
    setSensitiveConfig('1', '', ['Bad Word']);
    expect(checkSensitive('b a d-w o r d')).toBe('Bad Word');
  });

  test('总开关关闭后文件词也不生效', () => {
    setSensitiveConfig('0', '', ['文件违禁词']);
    expect(checkSensitive('文件违禁词')).toBeNull();
  });
});
