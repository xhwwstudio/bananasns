import { useEffect, useState } from 'react';
import api from '../api/client';
import { Button } from './heroui';
import { useSite } from '../context/SiteContext';
import { useToast } from '../context/ToastContext';

export interface RegisterVerifyValue {
  phone: string;
  phoneCode: string;
  email: string;
  emailCode: string;
}

/**
 * 注册页的手机/邮箱验证字段。
 * 只在后台开启对应开关时出现；验证码由 /api/auth/{sms,email}/send 发送。
 */
export default function RegisterVerifyFields({
  value,
  onChange,
}: {
  value: RegisterVerifyValue;
  onChange: (key: keyof RegisterVerifyValue, v: string) => void;
}) {
  const site = useSite();
  const toast = useToast();
  const [sending, setSending] = useState<'phone' | 'email' | null>(null);
  const [left, setLeft] = useState<{ phone: number; email: number }>({ phone: 0, email: 0 });

  useEffect(() => {
    if (left.phone <= 0 && left.email <= 0) return;
    const t = setInterval(() => {
      setLeft((s) => ({
        phone: Math.max(0, s.phone - 1),
        email: Math.max(0, s.email - 1),
      }));
    }, 1000);
    return () => clearInterval(t);
  }, [left.phone, left.email]);

  const send = async (kind: 'phone' | 'email') => {
    const target = kind === 'phone' ? value.phone.trim() : value.email.trim();
    if (!target) return toast.err(kind === 'phone' ? '请先填写手机号' : '请先填写邮箱');
    setSending(kind);
    try {
      await api.post(`/auth/${kind === 'phone' ? 'sms' : 'email'}/send`, {
        [kind]: target,
      });
      toast.ok('验证码已发送，请查收');
      setLeft((s) => ({ ...s, [kind]: 60 }));
    } catch (e: any) {
      toast.err(e.message);
    } finally {
      setSending(null);
    }
  };

  if (!site.phoneVerifyRequired && !site.emailVerifyRequired) return null;

  return (
    <>
      {site.phoneVerifyRequired && (
        <div className="field">
          <label>手机号（仅用于合规验证，不公开展示）</label>
          <input
            value={value.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="11 位中国大陆手机号"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
          />
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <input
              value={value.phoneCode}
              onChange={(e) => onChange('phoneCode', e.target.value)}
              placeholder="短信验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              style={{ flex: 1 }}
            />
            <Button
              type="button"
              size="sm"
              variant="bordered"
              className="banana-btn-app"
              isDisabled={sending === 'phone' || left.phone > 0}
              onClick={() => send('phone')}
              style={{ whiteSpace: 'nowrap', minWidth: 112 }}
            >
              {sending === 'phone' ? '发送中…' : left.phone > 0 ? `${left.phone}s 后重发` : '获取验证码'}
            </Button>
          </div>
        </div>
      )}
      {site.emailVerifyRequired && (
        <div className="field">
          <label>邮箱（用于注册验证）</label>
          <input
            value={value.email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            maxLength={128}
          />
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <input
              value={value.emailCode}
              onChange={(e) => onChange('emailCode', e.target.value)}
              placeholder="邮箱验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              style={{ flex: 1 }}
            />
            <Button
              type="button"
              size="sm"
              variant="bordered"
              className="banana-btn-app"
              isDisabled={sending === 'email' || left.email > 0}
              onClick={() => send('email')}
              style={{ whiteSpace: 'nowrap', minWidth: 112 }}
            >
              {sending === 'email' ? '发送中…' : left.email > 0 ? `${left.email}s 后重发` : '获取验证码'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
