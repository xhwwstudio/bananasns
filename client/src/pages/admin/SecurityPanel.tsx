import { useState, useEffect, Fragment } from 'react';
import { RowSkeleton } from '../../components/States';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import { confirmDialog } from '../../components/confirm';
import api from '../../api/client';
import { Toggle } from './ui';

// 安全后台：注册验证 / 防批量注册 / 频率限制 / 权限门控 / 敏感词 / 注册控制 / 举报理由 / 上传限制。
// 第 8 刀自 Admin.tsx 整体抽离：PERM_ACTIONS / SEC_GROUPS / Security 一并迁出，
// 组件自取自存、无外部 props，实现逐字不变。
const PERM_ACTIONS: [string, string][] = [
  ['comment', '评论'], ['dm', '私信'], ['upload', '上传图片 / 视频'], ['post', '发布动态'], ['thread', '发帖'],
];
// section 用于在「安全」tab 内按主题分组（注册验证此前被埋在中间，用户反馈找不到 → 提到最前并加分组标题）。
const SEC_GROUPS: any[] = [
  { section: '注册与登录安全', title: '防批量注册', desc: '限制同一 IP 的注册行为，拦截批量刷号。', toggle: 'anti_bulk_reg_enabled', nums: [
    ['reg_ip_max_per_day', '每个 IP 每日注册上限', '个'], ['reg_min_interval_sec', '两次注册最小间隔', '秒'],
  ] },
  { section: '内容与频率', title: '发帖 / 私信频率限制', desc: '防止刷屏与骚扰；管理员不受限制。', toggle: 'rate_limit_enabled', nums: [
    ['rate_post_per_min', '每分钟发帖上限', '条'], ['rate_post_per_hour', '每小时发帖上限', '条'],
    ['rate_thread_per_min', '每分钟发帖子上限', '个'], ['rate_dm_per_min', '每分钟私信上限', '条'],
  ] },
];

export default function SecurityPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [wordFiles, setWordFiles] = useState<any[]>([]);
  const [uploadingWords, setUploadingWords] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadWordFiles = () => api.get('/admin/sensitive/files').then(({ data }) => setWordFiles(data || [])).catch(() => setWordFiles([]));
  useEffect(() => {
    api.get('/admin/config').then(({ data }) => { setCfg(data.config); setSecrets(data.secretsSet || {}); }).catch(() => setCfg({}));
    loadWordFiles();
  }, []);
  const uploadWordFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    setUploadingWords(true);
    try {
      const { data } = await api.post('/admin/sensitive/files', fd);
      setWordFiles(data.files || []);
      if (data.skipped?.length) toast.err(data.skipped.map((s: any) => `${s.filename}：${s.reason}`).join('；'));
      else toast.ok(`已加入队列：${list.length} 个文件，默认停用，确认后手动开启`);
    } catch (e: any) { toast.err(e.message); }
    finally { setUploadingWords(false); }
  };
  const toggleWordFile = async (f: any) => {
    try {
      const { data } = await api.put(`/admin/sensitive/files/${f.id}`, { enabled: !f.enabled });
      setWordFiles(data || []);
    } catch (e: any) { toast.err(e.message); }
  };
  const deleteWordFile = async (f: any) => {
    if (!(await confirmDialog(`删除后不可恢复`, { title: `删除词库文件「${f.filename}」？`, confirmText: '删除' }))) return;
    try {
      const { data } = await api.delete(`/admin/sensitive/files/${f.id}`);
      setWordFiles(data || []);
    } catch (e: any) { toast.err(e.message); }
  };
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const isOn = (k: string) => cfg?.[k] === '1';
  const save = async () => {
    setSaving(true);
    try { await api.put('/admin/config', { config: cfg }); toast.ok('安全设置已保存'); }
    catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  let lastSection = '';
  return (
    <div className="flex flex-col gap-4">
      {SEC_GROUPS.map((g) => {
        const head = g.section && g.section !== lastSection ? g.section : null;
        lastSection = g.section || lastSection;
        return (
        <Fragment key={g.title}>
          {head && <div className="sec-head" style={{ marginTop: 2 }}>{head}</div>}
          <div className="ui-card" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{g.title}{g.planned && <span className="ui-badge" style={{ marginLeft: 8, fontSize: 11, fontWeight: 600 }}>规划中</span>}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{g.desc}</div>
              </div>
              {g.toggle && <Toggle on={isOn(g.toggle)} onChange={(v) => setK(g.toggle, v ? '1' : '0')} />}
            </div>
            {g.nums && (!g.toggle || isOn(g.toggle)) && (
              <div className="sec-grid">
                {g.nums.map(([k, label, unit]: any) => (
                  <label className="sec-field" key={k}>
                    <span className="sec-label">{label}</span>
                    <span className="sec-num">
                      <input type="number" value={cfg[k] ?? ''} min={0} onChange={(e) => setK(k, e.target.value)} />
                      <i>{unit}</i>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {g.toggles && (
              <div className="sec-toggles">
                {g.toggles.map(([k, label]: any) => (
                  <div className="row" style={{ justifyContent: 'space-between', gap: 12 }} key={k}>
                    <span style={{ fontSize: 13.5 }}>{label}</span>
                    <Toggle on={g.planned ? false : isOn(k)} onChange={(v) => setK(k, v ? '1' : '0')} disabled={g.planned} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Fragment>
      ); })}

      <div className="sec-head" style={{ marginTop: 2 }}>权限与内容过滤</div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>接口权限门控</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>按用户「等级 / VIP」限制各操作（如评论需 VIP、私信需 Lv.2…）。最低等级填 0 表示不限制；管理员不受限。</div>
          </div>
          <Toggle on={isOn('perm_enabled')} onChange={(v) => setK('perm_enabled', v ? '1' : '0')} />
        </div>
        {isOn('perm_enabled') && (
          <div className="perm-table">
            <div className="perm-row perm-head"><span>操作</span><span>最低等级</span><span>需要 VIP</span></div>
            {PERM_ACTIONS.map(([k, label]) => (
              <div className="perm-row" key={k}>
                <span className="perm-label">{label}</span>
                <span className="sec-num"><input type="number" min={0} max={60} value={cfg[`perm_${k}_min_level`] ?? '0'} onChange={(e) => setK(`perm_${k}_min_level`, e.target.value)} /><i>级</i></span>
                <Toggle on={isOn(`perm_${k}_require_vip`)} onChange={(v) => setK(`perm_${k}_require_vip`, v ? '1' : '0')} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>敏感词过滤</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>开启后，动态 / 评论 / 帖子 / 私信 / 资料含敏感词将被拦截。支持上传敏感词库文件，每个文件单独列队，可逐个启停/删除；上传后默认停用，确认词表后再开启。</div>
          </div>
          <Toggle on={isOn('sensitive_enabled')} onChange={(v) => setK('sensitive_enabled', v ? '1' : '0')} />
        </div>
        {isOn('sensitive_enabled') && (
          <>
            <div className="sec-head" style={{ marginTop: 14 }}>词库文件队列</div>
            <div className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>
              支持 <b>.txt / .dic / .csv / .list</b>，UTF-8；兼容「每行一词」和「逗号分隔」两种格式（如 sensitive-stop-words 的 色情类.txt / 广告.txt）。
              注意 <b>stopword.dic 是通用停止词</b>（标点、助词等），开启后会误伤正常内容，不建议启用。
            </div>
            <div className="row gap-8" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="banana-btn-app banana-btn-app--sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                {uploadingWords ? '上传中…' : '上传词库文件'}
                <input type="file" accept=".txt,.dic,.csv,.list,text/plain" multiple hidden onChange={uploadWordFiles} disabled={uploadingWords} />
              </label>
              <span className="faint" style={{ fontSize: 12 }}>{wordFiles.length} 个文件 · 单文件最大 5MB</span>
            </div>
            {wordFiles.length === 0 ? (
              <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>还没有上传词库文件。上传后会在下方逐个列出。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {wordFiles.map((f) => (
                  <div key={f.id} className="row gap-8" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '9px 10px', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{f.filename}</div>
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {Number(f.wordCount || 0).toLocaleString()} 条 · {f.createdAt || '—'} · {f.enabled ? '已启用' : '未启用'}
                      </div>
                    </div>
                    <Toggle on={!!f.enabled} onChange={() => toggleWordFile(f)} />
                    <button type="button" className="faint" style={{ fontSize: 12, color: 'var(--danger, #d64545)' }} onClick={() => deleteWordFile(f)}>删除</button>
                  </div>
                ))}
              </div>
            )}
            <div className="sec-head" style={{ marginTop: 16 }}>手动补充词（可选）</div>
            <label className="field" style={{ display: 'block' }}>
              <Textarea className="banana-inp" value={cfg.sensitive_words ?? ''} onChange={(e: any) => setK('sensitive_words', e.target.value)} minRows={3}
                placeholder="每行一个，或用逗号 / 顿号分隔；会与文件词库一起生效"
                style={{ width: '100%', marginTop: 4, lineHeight: 1.6 }} maxLength={8000} />
              <span className="faint" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{(cfg.sensitive_words || '').length}/8000 字符 · 匹配会忽略大小写与词内空格/符号</span>
            </label>
          </>
        )}
      </div>

      <div className="sec-head" style={{ marginTop: 2 }}>注册验证</div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>手机号验证（腾讯云短信）</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
              开启后注册必须填写手机号并验证短信验证码。手机号仅用于合规验证和账号找回，<b>不会出现在个人资料页或公开接口</b>。
              短信模板需包含两个参数：验证码、有效分钟数。
            </div>
          </div>
          <Toggle on={isOn('register_phone_verify')} onChange={(v) => setK('register_phone_verify', v ? '1' : '0')} />
        </div>
        {isOn('register_phone_verify') && (
          <div className="sec-grid" style={{ marginTop: 14 }}>
            <label className="sec-field"><span className="sec-label">SecretId</span>
              <Input className="banana-inp" value={cfg.sms_secret_id ?? ''} onChange={(e: any) => setK('sms_secret_id', e.target.value)} placeholder="腾讯云 SecretId" />
            </label>
            <label className="sec-field"><span className="sec-label">SecretKey {secrets.sms_secret_key ? '（已配置）' : ''}</span>
              <Input className="banana-inp" type="password" autoComplete="new-password" value={cfg.sms_secret_key ?? ''} onChange={(e: any) => setK('sms_secret_key', e.target.value)} placeholder={secrets.sms_secret_key ? '••••（留空保留）' : '腾讯云 SecretKey'} />
            </label>
            <label className="sec-field"><span className="sec-label">短信应用 SdkAppId</span>
              <Input className="banana-inp" value={cfg.sms_sdk_app_id ?? ''} onChange={(e: any) => setK('sms_sdk_app_id', e.target.value)} placeholder="1400xxxxxx" />
            </label>
            <label className="sec-field"><span className="sec-label">签名内容 SignName</span>
              <Input className="banana-inp" value={cfg.sms_sign_name ?? ''} onChange={(e: any) => setK('sms_sign_name', e.target.value)} placeholder="香蕉秘密" />
            </label>
            <label className="sec-field"><span className="sec-label">模板 ID</span>
              <Input className="banana-inp" value={cfg.sms_template_id ?? ''} onChange={(e: any) => setK('sms_template_id', e.target.value)} placeholder="1234567" />
            </label>
            <label className="sec-field"><span className="sec-label">地域</span>
              <Input className="banana-inp" value={cfg.sms_region ?? ''} onChange={(e: any) => setK('sms_region', e.target.value)} placeholder="ap-guangzhou" />
            </label>
          </div>
        )}
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>邮箱验证（SMTP）</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
              开启后注册必须填写邮箱并验证邮件验证码。支持任意 SMTP 服务（企业邮箱 / 腾讯企业邮 / SendGrid 等），
              端口 465 通常用 SSL，587 通常关闭 SSL 并使用 STARTTLS。
            </div>
          </div>
          <Toggle on={isOn('register_email_verify')} onChange={(v) => setK('register_email_verify', v ? '1' : '0')} />
        </div>
        {isOn('register_email_verify') && (
          <div className="sec-grid" style={{ marginTop: 14 }}>
            <label className="sec-field"><span className="sec-label">SMTP Host</span>
              <Input className="banana-inp" value={cfg.smtp_host ?? ''} onChange={(e: any) => setK('smtp_host', e.target.value)} placeholder="smtp.exmail.qq.com" />
            </label>
            <label className="sec-field"><span className="sec-label">端口</span>
              <Input className="banana-inp" type="number" value={cfg.smtp_port ?? ''} onChange={(e: any) => setK('smtp_port', e.target.value)} placeholder="465" />
            </label>
            <label className="sec-field"><span className="sec-label">SMTP 账号</span>
              <Input className="banana-inp" value={cfg.smtp_user ?? ''} onChange={(e: any) => setK('smtp_user', e.target.value)} placeholder="no-reply@example.com" />
            </label>
            <label className="sec-field"><span className="sec-label">SMTP 密码 / 授权码 {secrets.smtp_pass ? '（已配置）' : ''}</span>
              <Input className="banana-inp" type="password" autoComplete="new-password" value={cfg.smtp_pass ?? ''} onChange={(e: any) => setK('smtp_pass', e.target.value)} placeholder={secrets.smtp_pass ? '••••（留空保留）' : 'SMTP 密码或授权码'} />
            </label>
            <label className="sec-field"><span className="sec-label">发件人 From</span>
              <Input className="banana-inp" value={cfg.smtp_from ?? ''} onChange={(e: any) => setK('smtp_from', e.target.value)} placeholder="BananaSNS <no-reply@example.com>" />
            </label>
            <label className="sec-field row gap-8" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <input type="checkbox" checked={cfg.smtp_secure !== '0'} onChange={(e) => setK('smtp_secure', e.target.checked ? '1' : '0')} />
              <span className="sec-label" style={{ margin: 0 }}>使用 SSL/TLS（465 端口通常开启）</span>
            </label>
          </div>
        )}
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>注册控制</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>关闭注册后新用户无法注册（现有用户不受影响）；开启「邀请码必填」后，注册必须填写有效邀请人用户名。</div>
        <label className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span className="sec-label">开放注册</span>
          <Toggle on={(cfg.registration_enabled ?? '1') !== '0'} onChange={(v) => setK('registration_enabled', v ? '1' : '0')} />
        </label>
        <label className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span className="sec-label">邀请码必填</span>
          <Toggle on={cfg.invite_required === '1'} onChange={(v) => setK('invite_required', v ? '1' : '0')} />
        </label>
        <label className="sec-field" style={{ marginTop: 14, display: 'block' }}>
          <span className="sec-label">用户名规则（正则，留空用默认 2-20 位字母/数字/下划线/中文）</span>
          <Input className="banana-inp" maxLength={200} value={cfg.username_pattern ?? ''} onChange={(e: any) => setK('username_pattern', e.target.value)} placeholder="^[A-Za-z0-9_一-龥]{2,20}$" style={{ marginTop: 6, width: '100%' }} />
        </label>
        <label className="sec-field" style={{ marginTop: 10, display: 'block' }}>
          <span className="sec-label">用户名不符合时的提示文案</span>
          <Input className="banana-inp" maxLength={100} value={cfg.username_hint ?? ''} onChange={(e: any) => setK('username_hint', e.target.value)} placeholder="用户名需为 2-20 位字母、数字、下划线或中文" style={{ marginTop: 6, width: '100%' }} />
        </label>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>举报理由</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>用户举报内容时可选的理由列表（每行一个，留空用内置默认）。含「其他」项时允许填写补充说明。</div>
        <Textarea className="banana-inp" value={cfg.report_reasons ?? ''} onChange={(e: any) => setK('report_reasons', e.target.value)} minRows={5}
          placeholder="每行一个，例如：&#10;垃圾广告或营销&#10;色情低俗内容&#10;其他" style={{ width: '100%', marginTop: 10, lineHeight: 1.6 }} maxLength={500} />
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>上传限制</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>单个文件最大体积、单次最多上传张数（留空用默认 25MB / 9 张；仅可在系统硬顶 25MB/9 张内收紧）。</div>
        <div className="sec-grid" style={{ marginTop: 12 }}>
          <label className="sec-field"><span className="sec-label">单文件最大</span><span className="sec-num"><input type="number" min={1} max={25} value={cfg.upload_max_size_mb ?? ''} placeholder="25" onChange={(e) => setK('upload_max_size_mb', e.target.value)} /><i>MB</i></span></label>
          <label className="sec-field"><span className="sec-label">单次最多张数</span><span className="sec-num"><input type="number" min={1} max={9} value={cfg.upload_max_images ?? ''} placeholder="9" onChange={(e) => setK('upload_max_images', e.target.value)} /><i>张</i></span></label>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="banana-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存设置'}</Button>
      </div>
    </div>
  );
}
