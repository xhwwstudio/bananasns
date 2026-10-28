/**
 * 存储配置解析：site_config 优先，env 回退。
 * 纯函数，便于 vitest 驱动，无 I/O。
 */

export type StorageDriver = 'local' | 's3';

/**
 * 对象存储服务商：决定后台字段提示、Endpoint 规则与默认 path-style。
 * 实际传输仍统一走 S3 兼容协议（腾讯 COS / 阿里 OSS / 七牛 / AWS 都提供 S3 兼容入口）。
 */
export type StorageProvider = 'generic' | 'qiniu' | 'tencent' | 'aliyun' | 'aws';

export const STORAGE_PROVIDERS: { id: StorageProvider; label: string }[] = [
  { id: 'tencent', label: '腾讯云 COS' },
  { id: 'aliyun', label: '阿里云 OSS' },
  { id: 'qiniu', label: '七牛云 Kodo' },
  { id: 'aws', label: 'AWS S3' },
  { id: 'generic', label: 'S3 兼容 / MinIO / 其他' },
];

export function normalizeStorageProvider(v: unknown): StorageProvider | null {
  const s = String(v || '').trim().toLowerCase();
  return STORAGE_PROVIDERS.some((p) => p.id === s) ? (s as StorageProvider) : null;
}

export function inferStorageProvider(endpoint: string | null | undefined): StorageProvider {
  const host = String(endpoint || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!host) return 'generic';
  if (host.endsWith('.qiniucs.com')) return 'qiniu';
  if (host.endsWith('.myqcloud.com')) return 'tencent';
  if (host.endsWith('.aliyuncs.com')) return 'aliyun';
  if (/(^|\.)amazonaws\.com(\.cn)?$/.test(host)) return 'aws';
  return 'generic';
}

export interface StorageResolvedConfig {
  driver: StorageDriver;
  provider: StorageProvider;
  endpoint: string;
  bucket: string;
  region: string;
  publicUrl: string;
  forcePathStyle: boolean;
  accessKey: string;
  secretKey: string;
}

export interface StorageEnvLike {
  STORAGE_DRIVER?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_PUBLIC_URL?: string;
  S3_FORCE_PATH_STYLE?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
}

/**
 * 存储相关的 site_config 键全集——读配置、判来源、清空后台设置三处共用同一份，
 * 避免各自维护一份列表后漂移（漏一个键就会出现「清了还生效」的幽灵配置）。
 */
export const STORAGE_SITE_KEYS = [
  'storage_driver', 'storage_provider', 's3_endpoint', 's3_bucket', 's3_region',
  's3_public_url', 's3_force_path_style', 's3_access_key', 's3_secret_key',
] as const;

/** 掩码占位：后台 GET 不回显原密钥；PUT 提交此值视为「未改动」 */
export const SECRET_PLACEHOLDER = '••••';

export function isSecretPlaceholder(val: unknown): boolean {
  if (val == null) return true;
  const s = String(val);
  return s === '' || s === SECRET_PLACEHOLDER || /^•+$/.test(s);
}

/**
 * 七牛云 Kodo 的 S3 兼容区域与官方 Endpoint 规则（2026-09 官方文档）：
 *   Endpoint = https://s3.<Region ID>.qiniucs.com   ← s3 与区域之间是「点」，不是横线
 * 旧文档/教程里常见的 s3-cn-east-1 写法是错的，会导致 DNS/签名失败；resolveStorageConfig 会自动纠正。
 */
export const QINIU_REGIONS = [
  { id: 'cn-east-1', label: '华东-浙江' },
  { id: 'cn-east-2', label: '华东-浙江 2' },
  { id: 'cn-north-1', label: '华北-河北' },
  { id: 'cn-south-1', label: '华南-广东' },
  { id: 'us-north-1', label: '北美-洛杉矶' },
  { id: 'ap-southeast-1', label: '亚太-新加坡' },
  { id: 'ap-southeast-2', label: '亚太-河内' },
  { id: 'ap-southeast-3', label: '亚太-胡志明' },
] as const;

/** 是否为七牛 S3 兼容域名（含历史上错误的 s3-<region> 写法）。 */
export function isQiniuEndpoint(endpoint: string | null | undefined): boolean {
  return /(^|\.)qiniucs\.com$/i.test(String(endpoint || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
}

/** 从七牛 Endpoint 提取区域；不是七牛 Endpoint 或缺少区域时返回 null。 */
export function regionFromQiniuEndpoint(endpoint: string | null | undefined): string | null {
  const m = /^https?:\/\/s3[.-]([a-z0-9-]+)\.qiniucs\.com\/?$/i.exec(String(endpoint || '').trim());
  return m ? m[1].toLowerCase() : null;
}

/** 七牛标准 Endpoint（后台「七牛快速配置」用）。 */
export function qiniuEndpointForRegion(region: string): string {
  return `https://s3.${String(region || '').trim()}.qiniucs.com`;
}

/**
 * 纠正七牛旧写法：s3-cn-east-1.qiniucs.com → s3.cn-east-1.qiniucs.com，并去掉结尾斜杠。
 * 只处理 http(s) 且 host 完全匹配的七牛域名，不影响 AWS/MinIO 等其它 Endpoint。
 */
export function normalizeQiniuEndpoint(endpoint: string): string {
  const s = String(endpoint || '').trim().replace(/\/+$/, '');
  return s.replace(
    /^(https?:\/\/)s3-([a-z0-9-]+)\.qiniucs\.com$/i,
    '$1s3.$2.qiniucs.com',
  );
}

/** 各服务商标准 S3 兼容 Endpoint（区域 ID 由后台选择）。 */
export function providerEndpoint(provider: StorageProvider, region: string): string {
  const r = String(region || '').trim();
  switch (provider) {
    case 'qiniu':
      return qiniuEndpointForRegion(r);
    case 'tencent':
      return `https://cos.${r}.myqcloud.com`;
    case 'aliyun':
      return `https://s3.oss-${r}.aliyuncs.com`;
    case 'aws':
      return r.startsWith('cn-')
        ? `https://s3.${r}.amazonaws.com.cn`
        : `https://s3.${r}.amazonaws.com`;
    default:
      return '';
  }
}

/** 从服务商 Endpoint 反推区域；用于「只改 Endpoint、Region 忘了改」时自动纠正签名区域。 */
export function regionFromProviderEndpoint(
  provider: StorageProvider,
  endpoint: string | null | undefined,
): string | null {
  const s = String(endpoint || '').trim();
  let m: RegExpExecArray | null = null;
  switch (provider) {
    case 'qiniu':
      return regionFromQiniuEndpoint(s);
    case 'tencent':
      m = /^https?:\/\/cos\.([a-z0-9-]+)\.myqcloud\.com\/?$/i.exec(s);
      break;
    case 'aliyun':
      m = /^https?:\/\/s3\.oss-([a-z0-9-]+)(?:-internal)?\.aliyuncs\.com\/?$/i.exec(s);
      break;
    case 'aws':
      m = /^https?:\/\/s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com(?:\.cn)?\/?$/i.exec(s);
      if (m) return (m[1] || 'us-east-1').toLowerCase();
      break;
    default:
      return null;
  }
  return m ? m[1].toLowerCase() : null;
}

/** 统一去尾斜杠；七牛额外纠正旧的 s3-<region> 写法。 */
export function normalizeProviderEndpoint(provider: StorageProvider, endpoint: string): string {
  const s = String(endpoint || '').trim().replace(/\/+$/, '');
  return provider === 'qiniu' ? normalizeQiniuEndpoint(s) : s;
}

/**
 * 从 site_config map + env 解析存储配置。
 * site 键优先；空串视为未配置 → 回退 env。
 */
export function resolveStorageConfig(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = process.env as StorageEnvLike,
): StorageResolvedConfig {
  const pick = (siteKey: string, envVal: string | undefined, fallback = '') => {
    const s = site[siteKey];
    if (s != null && String(s).length > 0) return String(s);
    return envVal || fallback;
  };

  const accessKey = pick('s3_access_key', env.S3_ACCESS_KEY, '');
  const secretKey = pick('s3_secret_key', env.S3_SECRET_KEY, '');
  const bucket = pick('s3_bucket', env.S3_BUCKET, 'bananasns');
  let region = pick('s3_region', env.S3_REGION, 'us-east-1');
  const publicUrl = pick('s3_public_url', env.S3_PUBLIC_URL, '');

  // 服务商：后台显式选择 > 从 Endpoint 推断（兼容老配置）。
  const rawEndpoint = pick('s3_endpoint', env.S3_ENDPOINT, '');
  const provider = normalizeStorageProvider(site.storage_provider) || inferStorageProvider(rawEndpoint);
  let endpoint = rawEndpoint;
  if (!endpoint && provider !== 'generic') endpoint = providerEndpoint(provider, region);
  endpoint = normalizeProviderEndpoint(provider, endpoint);
  // Endpoint 里的区域优先于表单 Region，避免「只改 Endpoint、Region 没改」导致签名失败。
  const derivedRegion = regionFromProviderEndpoint(provider, endpoint);
  if (derivedRegion) region = derivedRegion;
  if (!endpoint) endpoint = 'http://127.0.0.1:9000';

  let forcePathStyle: boolean;
  if (site.s3_force_path_style === '1' || site.s3_force_path_style === '0') {
    forcePathStyle = site.s3_force_path_style === '1';
  } else if (env.S3_FORCE_PATH_STYLE != null && env.S3_FORCE_PATH_STYLE !== '') {
    forcePathStyle = env.S3_FORCE_PATH_STYLE === 'true';
  } else {
    // 腾讯 COS / 阿里 OSS / AWS 默认 virtual-hosted；七牛与通用/ MinIO 默认 path-style。
    forcePathStyle = !['tencent', 'aliyun', 'aws'].includes(provider);
  }

  let driver: StorageDriver;
  const siteDriver = (site.storage_driver || '').toLowerCase();
  if (siteDriver === 'local' || siteDriver === 's3') {
    driver = siteDriver;
  } else if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') {
    driver = env.STORAGE_DRIVER;
  } else {
    driver = accessKey ? 's3' : 'local';
  }

  return {
    driver,
    provider,
    endpoint,
    bucket,
    region,
    publicUrl,
    forcePathStyle,
    accessKey,
    secretKey,
  };
}

/**
 * 未填访问域名的预警。测试连接实测公开读通过时会把它撤掉——
 * 静态判断只是猜「大概率读不到」，实测结果比猜准。
 */
export const WARN_NO_PUBLIC_URL =
  '未配置访问域名（Public URL）。七牛云等私有桶生成的文件地址无法公开访问，请填写 CDN 或桶绑定域名。';

/** 七牛专属：S3 兼容域名不支持匿名读取，必须走 CDN 加速域名。 */
export const WARN_QINIU_NO_PUBLIC_URL =
  '七牛云 S3 访问域名不支持匿名读取：请在 Public URL 填写该空间的 CDN 加速域名（空间需设为公开读），否则上传成功但图片全部打不开。';

/**
 * 配置缺陷预警（driver=s3 时的静默隐患），供后台「测试连接」展示。
 * 纯函数，无 I/O；入参与 resolveStorageConfig 相同，保证驱动判定口径一致。
 */
export function storageConfigWarnings(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = {},
): string[] {
  const cfg = resolveStorageConfig(site, env);
  const warnings: string[] = [];
  const endpointConfigured = site.s3_endpoint || env.S3_ENDPOINT;
  const providerConfigured = !!normalizeStorageProvider(site.storage_provider);
  const providerLabel = STORAGE_PROVIDERS.find((p) => p.id === cfg.provider)?.label || '对象存储';

  if (cfg.driver !== 's3') {
    // 已经填了对象存储配置却仍是本地驱动：上传会静默落在磁盘，站长以为进了云。
    if (providerConfigured || endpointConfigured) {
      warnings.push(`已填写${providerLabel}配置，但当前存储驱动是「本地磁盘」，上传不会进入对象存储。请把驱动改为「S3 兼容」并保存。`);
    }
    return warnings;
  }

  const endpointSet =
    (site.s3_endpoint != null && String(site.s3_endpoint).length > 0) || !!env.S3_ENDPOINT;
  if (!endpointSet) {
    if (cfg.provider === 'generic') {
      warnings.push('未配置 S3 Endpoint，正在使用默认地址 http://127.0.0.1:9000，仅供本地 MinIO 调试用。');
    }
  } else if (!/^https?:\/\//i.test(cfg.endpoint)) {
    // 从控制台复制地址时最常见的两种手滑：漏掉协议头、把桶名一起粘进来
    warnings.push('S3 Endpoint 没带 http:// 或 https://，连接会直接失败。');
  } else if (/^https?:\/\/[^/]+\/./i.test(cfg.endpoint)) {
    warnings.push('S3 Endpoint 里带了路径，一般只填到域名为止，桶名请填到 Bucket 那一栏。');
  }

  const qiniu = cfg.provider === 'qiniu';
  if (qiniu) {
    const region = regionFromProviderEndpoint('qiniu', cfg.endpoint);
    if (!region) {
      warnings.push('七牛 Endpoint 格式应为 https://s3.<区域>.qiniucs.com（注意是 s3.cn-east-1，不是 s3-cn-east-1）。');
    } else if (!QINIU_REGIONS.some((r) => r.id === region)) {
      warnings.push(`七牛区域「${region}」不在官方列表（cn-east-1 / cn-north-1 / cn-south-1 等），请核对空间所在区域。`);
    }
    if (!cfg.forcePathStyle) {
      warnings.push('七牛建议开启 Force path style：虚拟主机风格需要桶域名证书支持，部分网络下会握手失败。');
    }
  }

  if (cfg.provider === 'tencent') {
    if (!regionFromProviderEndpoint('tencent', cfg.endpoint)) {
      warnings.push('腾讯云 COS Endpoint 格式应为 https://cos.<地域>.myqcloud.com，例如 https://cos.ap-guangzhou.myqcloud.com。');
    }
    if (!/-\d{5,}$/.test(cfg.bucket)) {
      warnings.push('腾讯云 COS 的 Bucket 必须带 APPID 后缀（如 uploads-1250000000），只填存储桶名称会报 NoSuchBucket。');
    }
    if (cfg.forcePathStyle) {
      warnings.push('腾讯云 COS 使用虚拟主机风格，请关闭 Force path style（否则会 404 / 签名失败）。');
    }
  }

  if (cfg.provider === 'aliyun') {
    if (!regionFromProviderEndpoint('aliyun', cfg.endpoint)) {
      warnings.push('阿里云 OSS Endpoint 格式应为 https://s3.oss-<地域>.aliyuncs.com，例如 https://s3.oss-cn-hangzhou.aliyuncs.com。');
    }
  }

  if (cfg.provider === 'aws') {
    if (!regionFromProviderEndpoint('aws', cfg.endpoint)) {
      warnings.push('AWS S3 Endpoint 格式应为 https://s3.<region>.amazonaws.com（中国区为 amazonaws.com.cn）。');
    }
  }

  if (!cfg.accessKey || !cfg.secretKey) {
    warnings.push('已选对象存储，但 Access Key / Secret Key 没填全，上传会直接失败。');
  }
  if (!cfg.publicUrl) {
    if (qiniu) warnings.push(WARN_QINIU_NO_PUBLIC_URL);
    else if (cfg.provider === 'tencent')
      warnings.push('腾讯云 COS 私有桶的文件地址需要签名：请填写该存储桶的 CDN 加速域名或默认访问域名，并把存储桶设为公有读，否则图片打不开。');
    else if (cfg.provider === 'aliyun')
      warnings.push('阿里云 OSS 私有桶的文件地址需要签名：请填写该 Bucket 的 CDN 域名或默认访问域名，并把 Bucket 设为公共读，否则图片打不开。');
    else if (cfg.provider === 'aws')
      warnings.push('未配置 Public URL：AWS S3 默认域名直链要求对象/桶允许公开读；如有 CDN 请填写 CDN 域名。');
    else warnings.push(WARN_NO_PUBLIC_URL);
  } else if (!/^https?:\/\//i.test(cfg.publicUrl)) {
    warnings.push('访问域名（Public URL）没带 http:// 或 https://，拼出来的文件地址打不开。');
  } else if (qiniu && /qiniucs\.com/i.test(cfg.publicUrl)) {
    warnings.push('Public URL 填的是七牛 S3 API 域名（*.qiniucs.com），它需要签名、不能匿名访问；请改填该空间的 CDN 加速域名。');
  }
  return warnings;
}

/**
 * 公开读探针的结论文案：写得进桶 ≠ 读得出来，站内图裂多半就坏在这一步。
 * 纯函数，入参是探针结果，返回给站长看的一句话；null 表示读通了、没话要说。
 */
export function describePublicReadResult(r: {
  status?: number;
  error?: string;
  publicUrlConfigured: boolean;
}): string | null {
  if (r.status != null && r.status >= 200 && r.status < 300) return null;
  const why =
    r.status == null
      ? `连不上（${r.error || '网络错误'}）`
      : r.status === 401 || r.status === 403
        ? `返回 ${r.status}（拒绝访问）`
        : r.status === 404
          ? '返回 404（地址指向的位置上没有文件）'
          : `返回 ${r.status}`;
  const fix = r.publicUrlConfigured
    ? '请确认访问域名（Public URL）绑定的正是这个桶，且桶或 CDN 允许公开读。'
    : '当前没填访问域名（Public URL），文件地址是按 Endpoint 拼的；私有桶请填 CDN 或桶绑定域名。';
  return `文件写得进去，但公开地址读不出来：${why}。站内图片会裂。${fix}`;
}

/**
 * 把 S3 SDK / 网络层抛出的错误翻译成站长能照着改的一句话。
 * 原始信息一律附在括号里保留（排查时要靠它），只在前面加一句「该改哪里」。
 * 纯函数，无 I/O：入参只用 name / message / 状态码，不碰 SDK 类型。
 */
export function describeStorageError(err: unknown): string {
  const e = (err || {}) as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const raw = e.message || String(err || '未知错误');
  const tag = `${e.name || ''} ${e.code || ''} ${raw}`;
  const status = e.$metadata?.httpStatusCode;
  const has = (...keys: string[]) => keys.some((k) => tag.toLowerCase().includes(k.toLowerCase()));
  const wrap = (hint: string) => `${hint}（原始错误：${raw}）`;

  if (has('NoSuchBucket')) return wrap('Bucket 不存在。请核对桶名，或先到服务商控制台创建这个桶。');
  if (has('InvalidAccessKeyId')) return wrap('Access Key 无效。请确认密钥没填错、没过期，且属于这个服务商。');
  if (has('SignatureDoesNotMatch')) return wrap('签名不匹配。多半是 Secret Key 填错，或 Region 与桶所在区域对不上。');
  if (has('PermanentRedirect', 'BucketRegionError', 'AuthorizationHeaderMalformed')) {
    return wrap('桶不在当前 Region 或 Endpoint 上。请把 Endpoint / Region 换成这个桶所在区域的值。');
  }
  if (has('AccessDenied') || status === 403) return wrap('密钥没有这个桶的读写权限。请在服务商控制台给它授权。');
  if (has('NotImplemented')) return wrap('服务商不支持这个 S3 接口。可尝试切换 Force path style，或换用兼容性更好的网关地址。');
  if (has('ENOTFOUND', 'EAI_AGAIN', 'getaddrinfo')) return wrap('Endpoint 域名解析不了。请检查拼写，以及服务器能否解析该域名。');
  if (has('ECONNREFUSED')) return wrap('连接被拒绝。目标服务没在跑，或端口不对（本机 MinIO 常见）。');
  if (has('ETIMEDOUT', 'ESOCKETTIMEDOUT', 'TimeoutError', 'aborted')) {
    return wrap('连接超时。请检查服务器出网、安全组与防火墙是否放行该地址。');
  }
  if (has('CERT', 'self-signed', 'self signed')) return wrap('HTTPS 证书验证失败（多为自签证书）。请换用受信任证书的地址。');
  if (has('Invalid URL', 'ERR_INVALID_URL')) return wrap('Endpoint 格式不对。要带上 http:// 或 https://，只填到域名。');
  if (has('Credential is missing', 'Resolved credential object is not valid')) {
    return wrap('没读到有效密钥。请填写 Access Key 与 Secret Key。');
  }
  return raw;
}

/** 某项配置最终取自哪里：后台设置 / 环境变量 / 内置默认 */
export type StorageConfigSource = 'site' | 'env' | 'default';

export interface StorageSourceMap {
  driver: StorageConfigSource;
  provider: StorageConfigSource;
  endpoint: StorageConfigSource;
  bucket: StorageConfigSource;
  region: StorageConfigSource;
  publicUrl: StorageConfigSource;
  forcePathStyle: StorageConfigSource;
  accessKey: StorageConfigSource;
  secretKey: StorageConfigSource;
}

/**
 * 逐项判定配置来源，口径与 resolveStorageConfig 严格一致。
 * 后台面板据此告诉站长「这个值是我填的，还是 .env 带进来的」——
 * 用 env 部署时后台字段全空，不标来源就会被误读成「没配对象存储」。
 */
export function resolveStorageSources(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = {},
): StorageSourceMap {
  const pick = (siteKey: string, envVal: string | undefined): StorageConfigSource => {
    const s = site[siteKey];
    if (s != null && String(s).length > 0) return 'site';
    return envVal ? 'env' : 'default';
  };

  const siteDriver = (site.storage_driver || '').toLowerCase();
  let driver: StorageConfigSource;
  if (siteDriver === 'local' || siteDriver === 's3') driver = 'site';
  else if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') driver = 'env';
  else driver = 'default'; // 兜底按「有无 AccessKey」推断

  let forcePathStyle: StorageConfigSource;
  if (site.s3_force_path_style === '1' || site.s3_force_path_style === '0') forcePathStyle = 'site';
  else if (env.S3_FORCE_PATH_STYLE) forcePathStyle = 'env';
  else forcePathStyle = 'default';

  return {
    driver,
    provider: pick('storage_provider', undefined),
    endpoint: pick('s3_endpoint', env.S3_ENDPOINT),
    bucket: pick('s3_bucket', env.S3_BUCKET),
    region: pick('s3_region', env.S3_REGION),
    publicUrl: pick('s3_public_url', env.S3_PUBLIC_URL),
    forcePathStyle,
    accessKey: pick('s3_access_key', env.S3_ACCESS_KEY),
    secretKey: pick('s3_secret_key', env.S3_SECRET_KEY),
  };
}

/** 配置指纹：变化时重建 S3Client */
export function storageConfigHash(c: StorageResolvedConfig): string {
  return [
    c.driver, c.provider, c.endpoint, c.bucket, c.region, c.publicUrl,
    c.forcePathStyle ? '1' : '0', c.accessKey, c.secretKey,
  ].join('|');
}

/** 密钥写入：占位/空 → 保留旧值；新值 → 使用新值 */
export function resolveSecretWrite(incoming: unknown, existing: string | null | undefined): string | null {
  if (isSecretPlaceholder(incoming)) {
    return existing != null ? String(existing) : null; // null = 不写入
  }
  return String(incoming);
}
