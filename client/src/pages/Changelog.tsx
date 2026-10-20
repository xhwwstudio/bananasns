import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Chip, Tabs, Tab, Textarea, Button } from '../components/heroui';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLayout, useSite } from '../context/SiteContext';
import SafeMarkdown from '../components/SafeMarkdown';
import api from '../api/client';
import { timeAgo } from '../lib/format';

const TYPE: Record<string, { label: string; color: string }> = {
  new: { label: '新增', color: 'success' },
  improve: { label: '优化', color: 'primary' },
  fix: { label: '修复', color: 'warning' },
  change: { label: '调整', color: 'default' },
  refactor: { label: '重构', color: 'secondary' },
};
const FB_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: '待处理', color: 'default' },
  planned: { label: '已采纳', color: 'secondary' },
  doing: { label: '处理中', color: 'warning' },
  resolved: { label: '已解决', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
};

const RELEASES = [
  {
    ver: 'v0.1.1', date: '2026-10-20 13:42:53', items: [
      ['change', '项目正式更名为 BananaSNS（中文主题名「香蕉」），版本号重置为 0.1.1：界面文案、默认站点名、包名、Docker 镜像/容器/数据卷、数据库标识与文档统一改为新品牌；后续小版本按 0.0.1 递增。'],
      ['new', '后台「外观 → 访问与游客」新增「显示欢迎登录页」开关：关闭后未登录访客不再经过登录页，直接以游客身份进入站点（只读）；开启时登录页保留「游客访问」入口。'],
      ['improve', '游客体验：顶部新增注册 / 登录引导条；首页隐藏发布器，换成「登录后分享你的第一条动态 →」引导，点击直接打开登录/注册弹窗。'],
      ['fix', '修复支付回调到账的并发幂等问题：改为 status=pending 的原子更新，只有更新成功才加积分；易支付回调补充订单金额校验，避免异常金额到账。'],
      ['fix', '修复登录 / 注册弹窗的提交按钮：HeroUI 按钮默认 type=button，导致弹窗内点「登录」或按回车都不提交；已改为 type=submit，并实测游客 CTA → 登录 → 发布器出现全链路。'],
    ],
  },
];

const ROADMAP = [
  { label: '进行中', color: 'primary', items: ['后端迁移到 NestJS + MySQL / Redis / 对象存储', '整体设计质量 & 移动端交互打磨', 'light / dark 双模式细节打磨'] },
  { label: '计划中', color: 'default', items: ['AI 助手（重新设计中）', '真实支付 + 余额提现', '群聊 / 聊天室', '长文专栏 / 资讯频道', '活动报名 · 抽奖 · 红包', 'VIP 等级 + 权限门控'] },
  { label: '已完成', color: 'success', items: ['现代技术栈升级（React 19 + HeroUI v3 + Tailwind 4）', '开源文档 + 中英双语 README', '网址导航 · 资讯快报门户', '任务中心 + 成就勋章', '问答 · 悬赏求助', '投票（单选/多选 + 实时占比）', '圈子（兴趣社群 + 圈内信息流）', '排行榜 · 会员 · 论坛 · 私信 · 积分商城', '全站丝滑转场 · 6 套配色 × 明暗模式'] },
];

function ReleaseCard({ r }: { r: any }) {
  return (
    <Card shadow="sm" radius="lg" className="mb-3 border border-default-200">
      <CardHeader className="flex items-center gap-3 pb-1">
        <Chip color="primary" variant="flat" size="sm" className="font-bold">{r.ver}</Chip>
        <span className="text-small text-default-500">{r.date}</span>
      </CardHeader>
      <CardBody className="pt-1 flex flex-col gap-2.5">
        {r.items.map(([t, text]: [string, string], i: number) => {
          const ty = TYPE[t] || TYPE.improve;
          return (
          <div key={i} className="flex items-start gap-2.5 text-small leading-relaxed">
            <Chip size="sm" variant="flat" color={ty.color as any} className="shrink-0">{ty.label}</Chip>
            <span className="text-default-700">{text}</span>
          </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

export default function Changelog() {
  const toast = useToast();
  const { user, setAuthOpen } = useAuth();
  const site = useSite();
  const layout = useLayout('changelog', 'narrow');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<any>(null);

  const loadFeedback = () => api.get('/feedback').then(({ data }) => setList(data.feedback)).catch(() => setList([]));
  useEffect(() => { loadFeedback(); }, []);

  const submit = async () => {
    if (!user) return setAuthOpen(true);
    if (content.trim().length < 5) return toast.err('再多写几个字吧～');
    setBusy(true);
    try {
      await api.post('/feedback', { content: content.trim() });
      setContent('');
      toast.ok('已收到，感谢你的反馈');
      loadFeedback();
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  };

  const showLog = site.pageChangelogOn !== false;
  const showRoadmap = site.pageRoadmapOn !== false;
  const customLog = (site.changelogContent || '').trim();
  const customRoadmap = (site.roadmapContent || '').trim();

  return (
    <Shell layout={layout}>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200 bg-gradient-to-br from-primary-50 to-content1">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="trend" size={22} style={{ color: 'var(--brand)' }} /> 更新日志 & 开发计划
          </h1>
          <p className="text-default-500 text-small mt-1">记录每一次更新与未来规划，你的每一条反馈我们都会认真看、认真回。</p>
        </CardBody>
      </Card>

      <Tabs aria-label="更新与反馈" color="primary" variant="solid" radius="lg" fullWidth size="lg">
        {showLog && (
        <Tab key="log" title="更新日志">
          <div className="mt-3">
            {customLog
              ? <Card shadow="sm" radius="lg" className="border border-default-200"><CardBody><SafeMarkdown source={customLog} /></CardBody></Card>
              : RELEASES.map((r) => <ReleaseCard key={r.ver} r={r} />)}
          </div>
        </Tab>
        )}

        {showRoadmap && (
        <Tab key="roadmap" title="开发计划">
          <div className="mt-3 flex flex-col gap-3">
            {customRoadmap
              ? <Card shadow="sm" radius="lg" className="border border-default-200"><CardBody><SafeMarkdown source={customRoadmap} /></CardBody></Card>
              : ROADMAP.map((g) => (
              <Card key={g.label} shadow="sm" radius="lg" className="border border-default-200">
                <CardHeader className="pb-1"><Chip color={g.color} variant="flat" className="font-bold">{g.label}</Chip></CardHeader>
                <CardBody className="pt-1 flex flex-col gap-2">
                  {g.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-small text-default-700">
                      <Icon name="check" size={14} style={{ color: g.color === 'success' ? 'var(--good)' : 'var(--brand)', opacity: g.color === 'default' ? 0.45 : 1 }} />
                      {it}
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>
        </Tab>
        )}

        <Tab key="feedback" title={`问题反馈${list?.length ? ` (${list.length})` : ''}`}>
          <Card shadow="sm" radius="lg" className="mt-3 border border-default-200">
            <CardBody className="gap-3">
              <p className="text-small text-default-600">发现 bug 或有功能建议？写下来，我们会认真看每一条并回复。</p>
              <Textarea value={content} onValueChange={setContent} minRows={3} maxLength={500}
                placeholder={user ? '描述你遇到的问题或想要的功能…' : '登录后即可提交反馈'} variant="bordered" radius="lg" />
              <div className="flex justify-end">
                <Button color="primary" radius="lg" onPress={submit} isLoading={busy} isDisabled={!content.trim()}>提交反馈</Button>
              </div>
            </CardBody>
          </Card>

          <div className="mt-3 flex flex-col gap-2.5">
            {list === null ? null : list.length === 0 ? (
              <Card shadow="sm" radius="lg"><CardBody className="text-center text-default-400 py-6 text-small">还没有反馈，来做第一个吧～</CardBody></Card>
            ) : list.map((f: any) => (
              <Card key={f.id} shadow="sm" radius="lg" className="border border-default-200">
                <CardBody className="gap-2">
                  <div className="flex items-center gap-2">
                    {f.user && <Avatar user={f.user} size={24} />}
                    <span className="text-small font-semibold text-default-700">{f.user?.nickname || '匿名用户'}</span>
                    <Chip size="sm" variant="flat" color={(FB_STATUS[f.status] || FB_STATUS.open).color}>{(FB_STATUS[f.status] || FB_STATUS.open).label}</Chip>
                    <span className="text-tiny text-default-400 ml-auto">{timeAgo(f.createdAt)}</span>
                  </div>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{f.content}</p>
                  {f.reply && (
                    <div className="bg-primary-50 rounded-medium p-3 text-small text-default-700 leading-relaxed">
                      <span className="font-bold text-primary">官方回复：</span>{f.reply}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </Tab>
      </Tabs>
    </Shell>
  );
}
