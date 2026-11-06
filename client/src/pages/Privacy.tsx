import Shell from '../components/Shell';
import { useSite } from '../context/SiteContext';

/**
 * 隐私政策（静态合规页）。
 * 说明账号信息、手机号/邮箱验证的用途与公开展示边界；运营方可按需替换文案。
 */
export default function Privacy() {
  const site = useSite();
  return (
    <Shell narrow>
      <div className="ui-card" style={{ padding: 28, lineHeight: 1.85 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>隐私政策</h1>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 18 }}>更新日期：2026-11-06 · 适用于 {site.name}</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>1. 我们收集的信息</h2>
        <p>注册和使用本站时，我们会保存账号名、昵称、加密后的密码、头像与简介等你主动填写的信息，以及发帖、评论、点赞、收藏、签到等站内行为记录。</p>
        <p>当站点开启注册验证时，我们会收集你的手机号或邮箱，仅用于发送验证码、完成账号验证和必要的合规联系。手机号不会出现在个人资料页、帖子作者信息或其他公开接口中。</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>2. 信息的使用</h2>
        <p>我们使用这些信息提供登录、内容发布、社区互动、消息通知、安全风控和账号找回等功能；不会将你的手机号、邮箱或密码出售给第三方。</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>3. 第三方服务</h2>
        <p>为提供图片存储、短信验证或邮件通知，我们可能使用腾讯云 COS、腾讯云短信、SMTP 邮件服务等第三方服务。相关服务仅接收完成对应功能所必需的信息。</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>4. 存储与安全</h2>
        <p>密码使用不可逆哈希保存；登录凭证、验证码和敏感配置不会通过公开接口返回。我们会在合理期限内保留账号与内容数据，并采取访问控制、限流和日志审计等措施。</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>5. 你的权利</h2>
        <p>你可以修改昵称、头像、简介等资料，也可以联系管理员申请更正或删除账号信息。涉及法律法规要求保留的记录，按相关规定处理。</p>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 18 }}>6. 联系我们</h2>
        <p>如对隐私政策有疑问，可通过「问题反馈」联系站点管理员。</p>
      </div>
    </Shell>
  );
}
