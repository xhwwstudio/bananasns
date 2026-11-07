import { useState } from 'react';
import Icon from './Icon';
import { useSite } from '../context/SiteContext';
import { SOCIAL_QR_ITEMS } from '../lib/socialQr';

/**
 * 右栏社交媒体模块：上方固定聊天群二维码，下方一排平台入口。
 * 桌面悬停、移动端点击显示二维码浮层；二维码和链接全部来自后台外观设置。
 */
export default function SocialQrWidget() {
  const { socialQr } = useSite();
  const [active, setActive] = useState<string | null>(null);
  const items = socialQr.items.filter((i) => i.qr || i.url);
  if (!socialQr.groupQr && !items.length) return null;
  const activeItem = items.find((i) => i.key === active) || null;
  const meta = (key: string) => SOCIAL_QR_ITEMS.find((x) => x.key === key);

  return (
    <div className="ui-card sqr-card" onMouseLeave={() => setActive(null)}>
      <div className="sqr-title"><Icon name="users" size={16} /> 关注与交流</div>

      {socialQr.groupQr && (
        <div className="sqr-group">
          <img src={socialQr.groupQr} alt={socialQr.groupTitle} loading="lazy" />
          <div className="sqr-group-copy">
            <b>{socialQr.groupTitle}</b>
            <p>{socialQr.groupText}</p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="sqr-social">
          {items.map((item) => {
            const m = meta(item.key);
            return (
              <button
                key={item.key}
                type="button"
                className={`sqr-item${active === item.key ? ' active' : ''}`}
                onMouseEnter={() => setActive(item.key)}
                onFocus={() => setActive(item.key)}
                onClick={() => setActive((k) => (k === item.key ? null : item.key))}
                aria-label={item.name}
              >
                <span className={`sqr-icon ${item.key}`}><Icon name={m?.icon || 'link'} size={18} /></span>
                <span className="sqr-label">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeItem && (
        <div className="sqr-pop" role="dialog" aria-label={`${activeItem.name}二维码`}>
          <div className="sqr-pop-head">{activeItem.name}</div>
          {activeItem.qr
            ? <img src={activeItem.qr} alt={`${activeItem.name}二维码`} />
            : <div className="sqr-pop-empty">暂未上传二维码</div>}
          {activeItem.url && (
            <a href={activeItem.url} target="_blank" rel="noopener noreferrer">打开主页 →</a>
          )}
        </div>
      )}
    </div>
  );
}
