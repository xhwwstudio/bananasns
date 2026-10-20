import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import api from '../api/client';

// 运营公告 banner — fetches the active site notice once per session and shows the
// top one (pinned first) as a dismissible bar above the page content. Dismissals are
// remembered per-notice in localStorage so a closed announcement won't nag again.

const DISMISS_KEY = 'banana_dismissed_notices';
let cache: any[] | null = null; // session cache: Shell remounts per route, don't refetch each time

const LEVEL_ICON: Record<string, string> = { info: 'bell', success: 'check', warning: 'flag', event: 'gift' };

function getDismissed(): number[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; }
}

export default function SiteNotice() {
  const [notices, setNotices] = useState<any[]>(cache || []);
  const [dismissed, setDismissed] = useState<number[]>(getDismissed());

  useEffect(() => {
    if (cache) { setNotices(cache); return; }
    let alive = true;
    api.get('/notices')
      .then(({ data }) => { cache = data.notices || []; if (alive) setNotices(cache!); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const notice = notices.find((n) => !dismissed.includes(n.id));
  if (!notice) return null;

  const dismiss = () => {
    const next = [...dismissed, notice.id];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50))); } catch { /* ignore */ }
  };

  const cta = notice.link && (
    notice.link.startsWith('/')
      ? <Link className="sn-cta" to={notice.link}>{notice.linkLabel || '查看'}<Icon name="back" size={13} className="sn-cta-arrow" /></Link>
      : <a className="sn-cta" href={notice.link} target="_blank" rel="noopener noreferrer">{notice.linkLabel || '查看'}<Icon name="back" size={13} className="sn-cta-arrow" /></a>
  );

  return (
    <div className={`site-notice lvl-${notice.level}`} role="status">
      <span className="sn-ico"><Icon name={LEVEL_ICON[notice.level] || 'bell'} size={16} /></span>
      <div className="sn-body">
        <span className="sn-title">{notice.title}</span>
        {notice.body && <span className="sn-text">{notice.body}</span>}
      </div>
      {cta}
      <button className="sn-close" onClick={dismiss} aria-label="关闭公告"><Icon name="close" size={15} /></button>
    </div>
  );
}
