import { useState, useEffect } from 'react';
import { Input, Button } from '../../components/heroui';
import { RowSkeleton } from '../../components/States';
import { useToast } from '../../context/ToastContext';
import { confirmDialog } from '../../components/confirm';
import api from '../../api/client';

type Source = 'site' | 'env' | 'default';
/** 测试结论三态：写不进去 / 写进去了但读不出来 / 三项全过 */
type TestLevel = 'ok' | 'warn' | 'fail';
type Status = {
  driver: 'local' | 's3';
  provider: 'generic' | 'qiniu' | 'tencent' | 'aliyun' | 'aws';
  sources: Record<string, Source>;
  endpoint: string;
  bucket: string;
  region: string;
  publicUrl: string;
  forcePathStyle: boolean;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  uploadsDir: string;
  sampleUrl: string;
  localFiles: number;
  localFilesCapped: boolean;
  localReferenced: number;
  localOrphans: number;
  localRefScanned: boolean;
  hasSiteConfig: boolean;
  warnings: string[];
};

const SOURCE_TEXT: Record<Source, string> = {
  site: '后台设置',
  env: '环境变量',
  default: '默认值',
};

const TEST_STYLE: Record<TestLevel, { title: string; bg: string; fg: string }> = {
  ok: { title: '测试通过', bg: 'var(--good-soft)', fg: 'var(--good-deep)' },
  warn: { title: '部分通过', bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  fail: { title: '测试没过', bg: 'var(--like-soft)', fg: 'var(--like)' },
};

const PROVIDERS = [
  { id: 'tencent', label: '腾讯云 COS' },
  { id: 'aliyun', label: '阿里云 OSS' },
  { id: 'qiniu', label: '七牛云 Kodo' },
  { id: 'aws', label: 'AWS S3' },
  { id: 'generic', label: 'S3 兼容 / MinIO / 其他' },
];

// 各服务商的常用区域（仍可手填；Endpoint 由区域按官方规则生成）
const PROVIDER_REGIONS: Record<string, { id: string; label: string }[]> = {
  tencent: [
    { id: 'ap-guangzhou', label: '广州' }, { id: 'ap-shanghai', label: '上海' },
    { id: 'ap-beijing', label: '北京' }, { id: 'ap-chengdu', label: '成都' },
    { id: 'ap-chongqing', label: '重庆' }, { id: 'ap-nanjing', label: '南京' },
    { id: 'ap-hongkong', label: '香港' }, { id: 'ap-singapore', label: '新加坡' },
    { id: 'ap-jakarta', label: '雅加达' }, { id: 'ap-bangkok', label: '曼谷' },
    { id: 'na-siliconvalley', label: '硅谷' }, { id: 'na-ashburn', label: '弗吉尼亚' },
    { id: 'eu-frankfurt', label: '法兰克福' }, { id: 'eu-moscow', label: '莫斯科' },
    { id: 'sa-saopaulo', label: '圣保罗' },
  ],
  aliyun: [
    { id: 'cn-hangzhou', label: '杭州' }, { id: 'cn-shanghai', label: '上海' },
    { id: 'cn-beijing', label: '北京' }, { id: 'cn-shenzhen', label: '深圳' },
    { id: 'cn-chengdu', label: '成都' }, { id: 'cn-zhangjiakou', label: '张家口' },
    { id: 'cn-qingdao', label: '青岛' }, { id: 'cn-hongkong', label: '香港' },
    { id: 'ap-southeast-1', label: '新加坡' }, { id: 'ap-northeast-1', label: '东京' },
    { id: 'eu-central-1', label: '法兰克福' }, { id: 'us-west-1', label: '硅谷' },
  ],
  qiniu: [
    { id: 'cn-east-1', label: '华东-浙江' }, { id: 'cn-east-2', label: '华东-浙江 2' },
    { id: 'cn-north-1', label: '华北-河北' }, { id: 'cn-south-1', label: '华南-广东' },
    { id: 'us-north-1', label: '北美-洛杉矶' }, { id: 'ap-southeast-1', label: '亚太-新加坡' },
    { id: 'ap-southeast-2', label: '亚太-河内' }, { id: 'ap-southeast-3', label: '亚太-胡志明' },
  ],
  aws: [
    { id: 'us-east-1', label: '弗吉尼亚' }, { id: 'us-west-2', label: '俄勒冈' },
    { id: 'ap-northeast-1', label: '东京' }, { id: 'ap-southeast-1', label: '新加坡' },
    { id: 'eu-west-1', label: '爱尔兰' }, { id: 'eu-central-1', label: '法兰克福' },
    { id: 'cn-north-1', label: '北京（中国区）' }, { id: 'cn-northwest-1', label: '宁夏（中国区）' },
  ],
  generic: [],
};

const DEFAULT_REGION: Record<string, string> = {
  tencent: 'ap-guangzhou', aliyun: 'cn-hangzhou', qiniu: 'cn-east-1', aws: 'us-east-1', generic: '',
};

function providerLabel(id?: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label || 'S3 兼容';
}

function providerEndpoint(provider: string, region: string): string {
  const r = region.trim();
  if (provider === 'tencent') return `https://cos.${r}.myqcloud.com`;
  if (provider === 'aliyun') return `https://s3.oss-${r}.aliyuncs.com`;
  if (provider === 'qiniu') return `https://s3.${r}.qiniucs.com`;
  if (provider === 'aws') return r.startsWith('cn-') ? `https://s3.${r}.amazonaws.com.cn` : `https://s3.${r}.amazonaws.com`;
  return '';
}

function inferProvider(endpoint?: string): string {
  const host = String(endpoint || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (host.endsWith('.myqcloud.com')) return 'tencent';
  if (host.endsWith('.aliyuncs.com')) return 'aliyun';
  if (host.endsWith('.qiniucs.com')) return 'qiniu';
  if (/(^|\.)amazonaws\.com(\.cn)?$/.test(host)) return 'aws';
  return 'generic';
}

function providerHint(p: string): string {
  if (p === 'tencent')
    return '腾讯云 COS：Bucket 必须带 APPID 后缀（如 uploads-1250000000），Region 选存储桶所在地域。Public URL 填 CDN 加速域名或 COS 默认域名；存储桶需设为公有读，私有桶的应用无法直接展示图片。';
  if (p === 'aliyun')
    return '阿里云 OSS：Endpoint 使用 S3 兼容格式 s3.oss-<地域>.aliyuncs.com，Region 与 Bucket 所在地域一致。Public URL 填 CDN 或 Bucket 默认域名；Bucket 需公共读。';
  if (p === 'qiniu')
    return '七牛云 Kodo：Bucket 填空间概览里的 S3 空间名，Public URL 必须填 CDN 加速域名；空间需公开读，七牛 S3 域名不支持匿名访问。';
  if (p === 'aws')
    return 'AWS S3：Region 与桶一致；Public URL 可填 CloudFront/CDN 域名，或使用允许公开读的 S3 默认域名。';
  return '通用 S3 兼容存储（MinIO、R2、自建网关等）：自行填写 Endpoint / Region；MinIO 通常开启 path-style。';
}

function bucketLabel(p: string): string {
  if (p === 'tencent') return 'Bucket（COS 存储桶，含 APPID）';
  if (p === 'qiniu') return 'Bucket（七牛：S3 空间名）';
  if (p === 'aliyun') return 'Bucket（OSS Bucket 名称）';
  return 'Bucket';
}

function keyLabels(p: string): { ak: string; sk: string } {
  if (p === 'tencent') return { ak: 'SecretId', sk: 'SecretKey' };
  if (p === 'aliyun') return { ak: 'AccessKey ID', sk: 'AccessKey Secret' };
  return { ak: 'Access Key', sk: 'Secret Key' };
}

/** 来源徽标：让站长一眼看出这个值是自己填的、.env 带进来的，还是内置兜底 */
function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  const env = source === 'env';
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 4,
        marginLeft: 6,
        whiteSpace: 'nowrap',
        background: env ? 'var(--gold-soft)' : 'var(--surface-2)',
        color: env ? 'var(--gold-deep)' : 'var(--ink-3)',
      }}
    >
      {SOURCE_TEXT[source]}
    </span>
  );
}

function StatusRow({ label, value, source }: { label: string; value: string; source?: Source }) {
  return (
    <div className="row gap-8" style={{ alignItems: 'baseline', fontSize: 12.5, marginTop: 5 }}>
      <span className="faint" style={{ minWidth: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>
        {value}
        <SourceTag source={source} />
      </span>
    </div>
  );
}

export default function StoragePanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [provider, setProvider] = useState('tencent');
  const [presetRegion, setPresetRegion] = useState('ap-guangzhou');
  const [testWarnings, setTestWarnings] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ level: TestLevel; message: string } | null>(null);
  const loadStatus = () =>
    api.get('/admin/storage/status').then(({ data }) => setStatus(data)).catch(() => undefined);
  useEffect(() => {
    api.get('/admin/config').then(({ data }) => {
      setCfg(data.config || {});
      setSecrets(data.secretsSet || {});
    }).catch(() => setCfg({}));
    loadStatus();
  }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  // 当前服务商：后台显式保存 > 后台 Endpoint 推断 > 环境变量/状态推断 > 默认腾讯云 COS
  useEffect(() => {
    const saved = String(cfg?.storage_provider || '').toLowerCase();
    if (PROVIDERS.some((p) => p.id === saved)) { setProvider(saved); return; }
    if (cfg?.s3_endpoint) { setProvider(inferProvider(cfg.s3_endpoint)); return; }
    if (status?.driver === 's3' && status.provider) { setProvider(status.provider); return; }
    setProvider('tencent');
  }, [cfg?.storage_provider, cfg?.s3_endpoint, status?.driver, status?.provider]);
  // 已保存的区域如果在当前服务商的常用列表里，选中它；否则保留该服务商默认区域
  useEffect(() => {
    const r = String(cfg?.s3_region || '').trim();
    const list = PROVIDER_REGIONS[provider] || [];
    if (list.some((x) => x.id === r)) setPresetRegion(r);
    else if (!r && DEFAULT_REGION[provider]) setPresetRegion(DEFAULT_REGION[provider]);
  }, [cfg?.s3_region, provider]);
  const changeProvider = (p: string) => {
    setProvider(p);
    setK('storage_provider', p);
    if (p !== 'generic') {
      const r = DEFAULT_REGION[p] || '';
      setPresetRegion(r);
      setK('storage_driver', 's3');
      setK('s3_region', r);
      setK('s3_endpoint', providerEndpoint(p, r));
      setK('s3_force_path_style', p === 'qiniu' ? '1' : '0');
    }
  };
  // 按当前服务商 + 区域填入标准 Endpoint / Region / path-style。
  const applyPreset = () => {
    setK('storage_driver', 's3');
    setK('storage_provider', provider);
    if (provider !== 'generic') {
      setK('s3_region', presetRegion);
      setK('s3_endpoint', providerEndpoint(provider, presetRegion));
      setK('s3_force_path_style', provider === 'qiniu' ? '1' : '0');
    }
    toast.ok(`已填入${providerLabel(provider)}标准配置；请补全 Bucket / AK / SK / 访问域名后点「保存存储配置」`);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/config', { config: cfg });
      toast.ok('存储配置已保存');
      const { data } = await api.get('/admin/config');
      setCfg(data.config || {});
      setSecrets(data.secretsSet || {});
      setTestWarnings([]);
      setTestResult(null);
      await loadStatus();
    } catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  // 清掉后台存的存储配置，退回 .env / 内置默认。PUT 留空是「保留原值」，
  // 所以不给这个入口就只能改库才能回退。
  const clearSite = async () => {
    const ok = await confirmDialog(
      '会删掉后台存的存储配置（含 Access Key / Secret Key），之后按环境变量或内置默认生效。\n已上传的文件不受影响，不会被删除或搬家。',
      { title: '清除后台存储设置？', confirmText: '清除' },
    );
    if (!ok) return;
    setClearing(true);
    try {
      const { data } = await api.delete('/admin/storage/site-config');
      toast.ok(data.cleared?.length ? `已清除 ${data.cleared.length} 项，改按环境变量 / 默认值生效` : '后台本来就没存配置');
      const res = await api.get('/admin/config');
      setCfg(res.data.config || {});
      setSecrets(res.data.secretsSet || {});
      setTestWarnings([]);
      setTestResult(null);
      await loadStatus();
    } catch (e: any) { toast.err(e.message); }
    finally { setClearing(false); }
  };
  // 结论留在页面上，不只弹一下 toast：失败信息现在长到需要照着改配置
  const test = async () => {
    setTesting(true);
    setTestWarnings([]);
    setTestResult(null);
    try {
      const { data } = await api.post('/admin/storage/test');
      setTestResult({
        level: (data.level as TestLevel) || (data.ok ? 'ok' : 'fail'),
        message: data.message || (data.ok ? '连接成功' : '连接失败'),
      });
      setTestWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (e: any) {
      setTestResult({ level: 'fail', message: e.message || '请求失败' });
    }
    finally { setTesting(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  const src = status?.sources || {};
  // 后台未填时按实际生效值显示，避免 env 部署的站点被显示成「本地磁盘」
  const driverValue = cfg.storage_driver || status?.driver || 'local';
  // env 带进来的值填进 placeholder：留空即沿用，填了才覆盖
  const envHint = (key: string, value?: string) =>
    src[key] === 'env' && value ? `${value}（来自环境变量）` : undefined;
  // 测过之后一律以本次结果为准：status 里那份是进页面时算的，可能已经过期
  const warnings = testResult ? testWarnings : status?.warnings || [];
  // 已切到对象存储、且本地目录里还有「被内容引用」的文件 = 需要跑一次迁移脚本。
  // 光看文件数会把孤儿（删过的帖子、测试残留）也算成待迁，对着无害残留喊迁移。
  const pendingLocal = status?.driver === 's3' && status.localReferenced > 0;
  // 切了 S3、磁盘上还有东西，但库里已经没人引用了：说清「不用管」，别让站长白跑一趟
  const onlyOrphans =
    status?.driver === 's3' && status.localReferenced === 0 && status.localOrphans > 0;
  return (
    <div className="flex flex-col gap-4">
      {status && (
        <div className="ui-card" style={{ padding: 18 }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>当前生效</div>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: status.driver === 's3' ? 'var(--brand-soft)' : 'var(--surface-2)',
                color: status.driver === 's3' ? 'var(--brand)' : 'var(--ink-3)',
              }}
            >
              {status.driver === 's3' ? '对象存储（S3 兼容）' : '本地磁盘'}
            </span>
            <SourceTag source={src.driver} />
          </div>
          {status.driver === 's3' ? (
            <>
              <StatusRow label="服务商" value={providerLabel(status.provider)} source={src.provider} />
              <StatusRow label="Endpoint" value={status.endpoint} source={src.endpoint} />
              <StatusRow label="Bucket" value={status.bucket} source={src.bucket} />
              <StatusRow label="Region" value={status.region} source={src.region} />
              <StatusRow
                label="Public URL"
                value={status.publicUrl || '未配置'}
                source={status.publicUrl ? src.publicUrl : undefined}
              />
              <StatusRow
                label="Path style"
                value={status.forcePathStyle ? '开' : '关'}
                source={src.forcePathStyle}
              />
              <StatusRow
                label="密钥"
                value={status.hasAccessKey && status.hasSecretKey ? '已配置' : '缺失'}
                source={status.hasAccessKey ? src.accessKey : undefined}
              />
            </>
          ) : (
            <StatusRow label="上传目录" value={status.uploadsDir} />
          )}
          <StatusRow label="文件地址" value={status.sampleUrl} />
          <div className="faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            后台设置优先于环境变量；下方字段留空即沿用环境变量的值。改动即时生效，无需重启。
          </div>
        </div>
      )}
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>对象存储</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          支持腾讯云 COS / 阿里云 OSS / 七牛云 Kodo / AWS S3 / 通用 S3 兼容（MinIO 等）。选择服务商后会自动填入对应 Endpoint 与 path-style；凭据仅后台可见且掩码，绝不进入公开站点配置。留空密钥 = 保留原值。
        </div>
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>对象存储服务商</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.65 }}>{providerHint(provider)}</div>
          <div className="row gap-8" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <select className="banana-inp" style={{ maxWidth: 220 }} value={provider} onChange={(e) => changeProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {(PROVIDER_REGIONS[provider] || []).length > 0 && (
              <select className="banana-inp" style={{ maxWidth: 220 }} value={presetRegion} onChange={(e) => setPresetRegion(e.target.value)}>
                {(PROVIDER_REGIONS[provider] || []).map((r) => (
                  <option key={r.id} value={r.id}>{r.label}（{r.id}）</option>
                ))}
              </select>
            )}
            <Button type="button" size="sm" variant="bordered" className="banana-btn-app" onClick={applyPreset}>填入标准配置</Button>
          </div>
        </div>
        <div className="sec-grid" style={{ marginTop: 14 }}>
          <label className="sec-field">
            <span className="sec-label">存储驱动</span>
            <select className="banana-inp" value={driverValue} onChange={(e) => setK('storage_driver', e.target.value)}>
              <option value="local">本地磁盘</option>
              <option value="s3">S3 兼容</option>
            </select>
          </label>
          <label className="sec-field">
            <span className="sec-label">S3 Endpoint</span>
            <Input className="banana-inp" value={cfg.s3_endpoint ?? ''} onChange={(e: any) => setK('s3_endpoint', e.target.value)} placeholder={envHint('endpoint', status?.endpoint) || providerEndpoint(provider, presetRegion) || 'https://s3.example.com'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">{bucketLabel(provider)}</span>
            <Input className="banana-inp" value={cfg.s3_bucket ?? ''} onChange={(e: any) => setK('s3_bucket', e.target.value)} placeholder={envHint('bucket', status?.bucket) || (provider === 'tencent' ? 'uploads-1250000000' : 'bananasns')} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Region（{presetRegion || '自定义'}）</span>
            <Input className="banana-inp" value={cfg.s3_region ?? ''} onChange={(e: any) => setK('s3_region', e.target.value)} placeholder={envHint('region', status?.region) || presetRegion || 'us-east-1'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Public URL（访问域名）</span>
            <Input className="banana-inp" value={cfg.s3_public_url ?? ''} onChange={(e: any) => setK('s3_public_url', e.target.value)} placeholder={envHint('publicUrl', status?.publicUrl) || 'https://cdn.example.com'} />
          </label>
          <label className="sec-field row gap-8" style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 腾讯/阿里/AWS 默认 virtual-hosted（不勾）；七牛/通用默认 path-style */}
            <input type="checkbox" checked={(cfg.s3_force_path_style ?? (status?.forcePathStyle ? '1' : '0')) === '1'}
              onChange={(e) => setK('s3_force_path_style', e.target.checked ? '1' : '0')} />
            <span className="sec-label" style={{ margin: 0 }}>Force path style（七牛 / MinIO 建议开启）</span>
          </label>
          <label className="sec-field">
            <span className="sec-label">{keyLabels(provider).ak} {secrets.s3_access_key ? '（已配置）' : ''}</span>
            <Input className="banana-inp" type="password" autoComplete="new-password"
              value={cfg.s3_access_key ?? ''} onChange={(e: any) => setK('s3_access_key', e.target.value)}
              placeholder={secrets.s3_access_key ? '••••（留空保留）' : src.accessKey === 'env' ? '已由环境变量提供' : keyLabels(provider).ak} />
          </label>
          <label className="sec-field">
            <span className="sec-label">{keyLabels(provider).sk} {secrets.s3_secret_key ? '（已配置）' : ''}</span>
            <Input className="banana-inp" type="password" autoComplete="new-password"
              value={cfg.s3_secret_key ?? ''} onChange={(e: any) => setK('s3_secret_key', e.target.value)}
              placeholder={secrets.s3_secret_key ? '••••（留空保留）' : src.secretKey === 'env' ? '已由环境变量提供' : keyLabels(provider).sk} />
          </label>
        </div>
        {/* 切到 S3 后本地目录里还躺着老文件——不提示的话站长会以为「切完就完事了」，
            直到某天删了 uploads 卷才发现老图全裂。有被引用的存量才升级成醒目提示。 */}
        {pendingLocal ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--gold-soft)', color: 'var(--gold-deep)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              本地还有 {status!.localReferenced}{status!.localFilesCapped ? '+' : ''} 个在用的旧文件没迁走
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>
              新上传已走对象存储，这些文件仍从本机磁盘读，换机器或重建容器就会裂图。在服务器上跑一次迁移脚本（先 dry-run 看清单，再加 --execute 真迁）：
              {status!.localOrphans > 0 && (
                <>
                  {' '}目录里另有 {status!.localOrphans} 个没人引用的残留，脚本不会动，也不用管。
                </>
              )}
              {!status!.localRefScanned && (
                <>
                  {' '}（这次没能扫库对引用，上面是目录里的全部文件数，其中可能有已经没人用的残留。）
                </>
              )}
            </div>
            <code style={{ display: 'block', marginTop: 8, padding: 8, background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
              node server-nest/scripts/migrate-uploads-to-s3.mjs{'\n'}
              node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
            </code>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              docker 部署换成 <code>docker compose exec app node scripts/migrate-uploads-to-s3.mjs …</code>，并给实际迁移那条多加
              {' '}<code>--manifest-dir /app/manifests</code>：改库前的回滚清单默认写在容器可写层，容器一重建就没了。
            </div>
          </div>
        ) : onlyOrphans ? (
          <div className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>
            存量已迁完：本地目录还剩 {status!.localOrphans} 个文件，但库里已经没有内容引用它们（删过的帖子、测试残留），
            迁移脚本不会动，也不影响换机器。要清理可以直接删 uploads 目录里这些文件。
            <code style={{ display: 'block', marginTop: 6, padding: 8, background: 'var(--surface-2)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              node server-nest/scripts/migrate-uploads-to-s3.mjs
            </code>
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>
            存量迁移（默认 dry-run）：
            <code style={{ display: 'block', marginTop: 6, padding: 8, background: 'var(--surface-2)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              node server-nest/scripts/migrate-uploads-to-s3.mjs{'\n'}
              node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
            </code>
          </div>
        )}
      </div>
      {testResult && (
        <div
          className="ui-card"
          style={{ padding: '12px 18px', background: TEST_STYLE[testResult.level].bg }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: TEST_STYLE[testResult.level].fg }}>
            {TEST_STYLE[testResult.level].title}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.7, color: 'var(--ink-2)', wordBreak: 'break-word' }}>
            {testResult.message}
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="ui-card" style={{ padding: '12px 18px', background: 'var(--gold-soft)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold-deep)' }}>配置预警</div>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: 'var(--gold-deep)' }}>{w}</div>
          ))}
        </div>
      )}
      <div className="row gap-8" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {status?.hasSiteConfig && (
          <Button color="danger" variant="light" className="banana-btn-app" onClick={clearSite} isDisabled={clearing}>{clearing ? '清除中…' : '清除后台设置'}</Button>
        )}
        <Button variant="bordered" className="banana-btn-app" onClick={test} isDisabled={testing}>{testing ? '测试中…' : '测试连接'}</Button>
        <Button color="primary" className="banana-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存存储配置'}</Button>
      </div>
    </div>
  );
}
