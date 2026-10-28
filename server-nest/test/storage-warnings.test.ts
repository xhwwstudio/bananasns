import { describe, test, expect } from 'vitest';
import {
  storageConfigWarnings,
  resolveStorageConfig,
  describeStorageError,
  describePublicReadResult,
} from '../src/modules/storage/storage-config';

// 纯函数测试：driver=s3 时的配置缺陷预警（endpoint 缺省 / 格式不对 / 密钥不全 / publicUrl 缺失）。
// env 一律显式传 {}，避免 process.env 泄漏影响判定。
const KEYS = { s3_access_key: 'ak', s3_secret_key: 'sk' };

describe('storageConfigWarnings 配置缺陷预警', () => {
  test('local 驱动 → 无预警', () => {
    expect(storageConfigWarnings({}, {})).toEqual([]);
    expect(storageConfigWarnings({ storage_driver: 'local' }, {})).toEqual([]);
  });

  test('s3 且 endpoint（site 或 env）与 publicUrl 均已配 → 无预警', () => {
    expect(
      storageConfigWarnings(
        {
          ...KEYS,
          storage_driver: 's3',
          s3_endpoint: 'https://s3-cn-east-1.qiniucs.com',
          s3_public_url: 'https://cdn.example.com',
        },
        {},
      ),
    ).toEqual([]);
    // endpoint 只配在 env 也算显式配置
    expect(
      storageConfigWarnings(
        { ...KEYS, storage_driver: 's3', s3_public_url: 'https://cdn.example.com' },
        { S3_ENDPOINT: 'https://s3.example.com' },
      ),
    ).toEqual([]);
  });

  test('s3 且 site/env 均未配 endpoint → 默认地址预警', () => {
    const w = storageConfigWarnings(
      { ...KEYS, storage_driver: 's3', s3_public_url: 'https://cdn.example.com' },
      {},
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('http://127.0.0.1:9000');
  });

  test('site 空串 endpoint 视为未配置 → 仍预警', () => {
    const w = storageConfigWarnings(
      { ...KEYS, storage_driver: 's3', s3_endpoint: '', s3_public_url: 'https://cdn.example.com' },
      {},
    );
    expect(w.some((x) => x.includes('127.0.0.1:9000'))).toBe(true);
  });

  test('s3 且未配 publicUrl → 访问域名预警', () => {
    const w = storageConfigWarnings(
      { ...KEYS, storage_driver: 's3', s3_endpoint: 'https://s3.example.com' },
      {},
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('Public URL');
  });

  test('endpoint 与 publicUrl 都缺 → 两条预警', () => {
    const w = storageConfigWarnings({ ...KEYS, storage_driver: 's3' }, {});
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('127.0.0.1:9000');
    expect(w[1]).toContain('Public URL');
  });

  // 从控制台复制粘贴时最常见的几种手滑，测试连接之前就该拦下来
  test('endpoint 漏协议头 / 带桶名路径 → 各自预警', () => {
    const base = { ...KEYS, storage_driver: 's3', s3_public_url: 'https://cdn.example.com' };
    expect(
      storageConfigWarnings({ ...base, s3_endpoint: 's3.example.com' }, {}).join(),
    ).toContain('http:// 或 https://');
    expect(
      storageConfigWarnings({ ...base, s3_endpoint: 'https://s3.example.com/my-bucket' }, {}).join(),
    ).toContain('带了路径');
    // 结尾一个斜杠是合法写法，不该报路径
    expect(storageConfigWarnings({ ...base, s3_endpoint: 'https://s3.example.com/' }, {})).toEqual([]);
  });

  test('publicUrl 漏协议头 → 预警（而非当作未配置）', () => {
    const w = storageConfigWarnings(
      { ...KEYS, storage_driver: 's3', s3_endpoint: 'https://s3.example.com', s3_public_url: 'cdn.example.com' },
      {},
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('http:// 或 https://');
  });

  test('显式选 s3 但密钥不全 → 预警；两把都填才消掉', () => {
    const base = {
      storage_driver: 's3',
      s3_endpoint: 'https://s3.example.com',
      s3_public_url: 'https://cdn.example.com',
    };
    expect(storageConfigWarnings(base, {}).join()).toContain('Access Key / Secret Key');
    expect(storageConfigWarnings({ ...base, s3_access_key: 'ak' }, {}).join()).toContain('Access Key / Secret Key');
    expect(storageConfigWarnings({ ...base, ...KEYS }, {})).toEqual([]);
    // env 提供密钥同样算数
    expect(
      storageConfigWarnings(base, { S3_ACCESS_KEY: 'ak', S3_SECRET_KEY: 'sk' }),
    ).toEqual([]);
  });

  // 七牛 Kodo：官方 Endpoint 是 s3.<region>.qiniucs.com，旧教程常见的 s3-<region> 要能自动纠正
  test('七牛旧写法 s3-<region> 自动归一为 s3.<region>，并按 Endpoint 推导 region', () => {
    const cfg = resolveStorageConfig(
      {
        ...KEYS,
        storage_driver: 's3',
        s3_endpoint: 'https://s3-cn-east-1.qiniucs.com/',
        s3_region: 'us-east-1',
        s3_public_url: 'https://cdn.example.com',
      },
      {},
    );
    expect(cfg.endpoint).toBe('https://s3.cn-east-1.qiniucs.com');
    expect(cfg.region).toBe('cn-east-1');
    expect(storageConfigWarnings({ ...KEYS, storage_driver: 's3', s3_endpoint: cfg.endpoint, s3_public_url: 'https://cdn.example.com' }, {})).toEqual([]);
  });

  test('七牛填了配置但驱动仍是本地 → 明确预警不会进七牛', () => {
    const w = storageConfigWarnings(
      {
        ...KEYS,
        storage_driver: 'local',
        s3_endpoint: 'https://s3.cn-east-1.qiniucs.com',
        s3_public_url: 'https://cdn.example.com',
      },
      {},
    );
    expect(w.join()).toContain('不会进入对象存储');
  });

  test('腾讯云 COS 标准配置 → 无预警；Bucket 缺 APPID / Endpoint 不标准 → 预警', () => {
    const base = {
      ...KEYS,
      storage_driver: 's3',
      storage_provider: 'tencent',
      s3_endpoint: 'https://cos.ap-guangzhou.myqcloud.com',
      s3_bucket: 'uploads-1250000000',
      s3_public_url: 'https://cdn.example.com',
    };
    expect(storageConfigWarnings(base, {})).toEqual([]);
    const cfg = resolveStorageConfig(base, {});
    expect(cfg.region).toBe('ap-guangzhou');
    expect(cfg.forcePathStyle).toBe(false);

    expect(storageConfigWarnings({ ...base, s3_bucket: 'uploads' }, {}).join()).toContain('APPID');
    expect(
      storageConfigWarnings({ ...base, s3_endpoint: 'https://cos.ap-guangzhou.myqcloud.com/' }, {}),
    ).toEqual([]);
    expect(
      storageConfigWarnings({ ...base, s3_endpoint: 'https://s3.example.com' }, {}).join(),
    ).toContain('cos.<地域>.myqcloud.com');
  });

  test('阿里云 OSS 标准配置 → 无预警，Endpoint 自动映射区域', () => {
    const base = {
      ...KEYS,
      storage_driver: 's3',
      storage_provider: 'aliyun',
      s3_endpoint: 'https://s3.oss-cn-hangzhou.aliyuncs.com',
      s3_bucket: 'bananasns',
      s3_public_url: 'https://cdn.example.com',
    };
    expect(storageConfigWarnings(base, {})).toEqual([]);
    const cfg = resolveStorageConfig(base, {});
    expect(cfg.region).toBe('cn-hangzhou');
    expect(cfg.forcePathStyle).toBe(false);
    expect(
      storageConfigWarnings({ ...base, s3_endpoint: 'https://oss-cn-hangzhou.aliyuncs.com' }, {}).join(),
    ).toContain('s3.oss-<地域>.aliyuncs.com');
  });

  test('未显式选服务商时按 Endpoint 自动识别，并套用各家的 path-style 默认值', () => {
    const tencent = resolveStorageConfig({ s3_endpoint: 'https://cos.ap-shanghai.myqcloud.com', s3_region: 'us-east-1' }, {});
    expect(tencent.provider).toBe('tencent');
    expect(tencent.region).toBe('ap-shanghai');
    expect(tencent.forcePathStyle).toBe(false);

    const aliyun = resolveStorageConfig({ s3_endpoint: 'https://s3.oss-cn-beijing.aliyuncs.com' }, {});
    expect(aliyun.provider).toBe('aliyun');
    expect(aliyun.region).toBe('cn-beijing');
    expect(aliyun.forcePathStyle).toBe(false);

    const qiniu = resolveStorageConfig({ s3_endpoint: 'https://s3.cn-east-1.qiniucs.com' }, {});
    expect(qiniu.provider).toBe('qiniu');
    expect(qiniu.forcePathStyle).toBe(true);
  });

  test('存储驱动为本地但选了腾讯云 → 提示不会进对象存储', () => {
    const w = storageConfigWarnings(
      { ...KEYS, storage_driver: 'local', storage_provider: 'tencent', s3_endpoint: 'https://cos.ap-guangzhou.myqcloud.com' },
      {},
    );
    expect(w.join()).toContain('不会进入对象存储');
  });

  test('七牛缺 CDN 域名 / Public URL 填成 S3 域名 → 专属预警', () => {
    const base = {
      ...KEYS,
      storage_driver: 's3',
      s3_endpoint: 'https://s3.cn-east-1.qiniucs.com',
    };
    expect(storageConfigWarnings(base, {}).join()).toContain('不支持匿名读取');
    expect(
      storageConfigWarnings({ ...base, s3_public_url: 'https://s3.cn-east-1.qiniucs.com' }, {}).join(),
    ).toContain('CDN 加速域名');
  });

  test('七牛 Endpoint 缺少区域 → 提示标准格式', () => {
    const w = storageConfigWarnings(
      {
        ...KEYS,
        storage_driver: 's3',
        s3_endpoint: 'https://s3.qiniucs.com',
        s3_public_url: 'https://cdn.example.com',
      },
      {},
    );
    expect(w.join()).toContain('s3.<区域>.qiniucs.com');
  });
});

// 测试连接失败时，站长看到的应该是「该改哪里」，而不是一串 AWS SDK 英文
describe('describeStorageError 错误翻译', () => {
  const cases: [any, string][] = [
    [{ name: 'NoSuchBucket', message: 'The specified bucket does not exist' }, 'Bucket 不存在'],
    [{ name: 'InvalidAccessKeyId', message: 'bad key' }, 'Access Key 无效'],
    [{ name: 'SignatureDoesNotMatch', message: 'mismatch' }, '签名不匹配'],
    [{ name: 'PermanentRedirect', message: 'wrong region' }, 'Region 或 Endpoint'],
    [{ name: 'AccessDenied', message: 'denied' }, '读写权限'],
    [{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND s3.bad' }, '域名解析'],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:9000' }, '连接被拒绝'],
    [{ name: 'TimeoutError', message: 'socket timeout' }, '连接超时'],
    [{ message: 'self-signed certificate in certificate chain' }, '证书'],
    [{ message: 'Invalid URL' }, 'Endpoint 格式'],
  ];
  test.each(cases)('%o → 给出可操作提示', (err, expected) => {
    const msg = describeStorageError(err);
    expect(msg).toContain(expected);
    // 原始信息必须保留：排查最终还是要看它
    expect(msg).toContain(err.message);
  });

  test('403 状态码也按权限解释', () => {
    expect(describeStorageError({ message: 'Forbidden', $metadata: { httpStatusCode: 403 } })).toContain('权限');
  });

  test('认不出来的错误原样返回，不硬编故事', () => {
    expect(describeStorageError({ message: '某种没见过的错误' })).toBe('某种没见过的错误');
    expect(describeStorageError(null)).toBe('未知错误');
  });
});

// 写得进桶不等于读得出来——图裂几乎都坏在这一步，文案要分「填没填 Public URL」两种说法
describe('describePublicReadResult 公开读探针结论', () => {
  test('2xx → 没话要说', () => {
    expect(describePublicReadResult({ status: 200, publicUrlConfigured: true })).toBeNull();
    expect(describePublicReadResult({ status: 204, publicUrlConfigured: false })).toBeNull();
  });

  test('403 → 指向桶/CDN 公开读设置', () => {
    const m = describePublicReadResult({ status: 403, publicUrlConfigured: true })!;
    expect(m).toContain('拒绝访问');
    expect(m).toContain('Public URL');
  });

  test('没填 Public URL 时改口径：先让站长去填域名', () => {
    const m = describePublicReadResult({ status: 404, publicUrlConfigured: false })!;
    expect(m).toContain('没填访问域名');
    expect(m).toContain('404');
  });

  test('网络层失败 → 带上原因', () => {
    const m = describePublicReadResult({ error: '超时（4 秒）', publicUrlConfigured: true })!;
    expect(m).toContain('超时（4 秒）');
  });
});
