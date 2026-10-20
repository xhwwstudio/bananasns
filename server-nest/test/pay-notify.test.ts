import 'reflect-metadata';
import { describe, expect, test } from 'vitest';
import { PayService } from '../src/modules/pay/pay.service';

// 支付异步回调 handleEpayNotify 是 money-path 最关键的安全逻辑：验签防伪造、只在 TRADE_SUCCESS 到账、
// 金额与订单一致、且**幂等**——支付网关可能并发/重复回调，已到账订单绝不能二次发积分。
// mock 仓库/site/helpers 测「真实」handler(不改源码)；用真实私有 epaySign 造合法签名。
function svc({ order = null as any, key = 'key456', updateAffected = null as number | null } = {}) {
  const cfg: Record<string, string> = {
    pay_epay_enabled: '1', pay_epay_pid: 'pid', pay_epay_key: key, pay_epay_url: 'https://x/',
  };
  const state = { updates: [] as any[], awards: [] as any[], notifies: 0 };
  const repo = {
    findOne: async () => order,
    update: async (criteria: any, patch: any) => {
      state.updates.push({ criteria, patch });
      const affected = updateAffected == null
        ? (order && order.status === 'pending' ? 1 : 0)
        : updateAffected;
      if (affected && order) order.status = 'paid'; // 模拟原子 UPDATE 生效
      return { affected };
    },
  };
  const s = new PayService(
    repo as any,
    null as any,
    { getConfig: async (k: string) => (k in cfg ? cfg[k] : null) } as any,
    {
      nowSql: () => '2026-07-02 12:00:00',
      award: async (uid: number, d: any) => { state.awards.push({ uid, ...d }); },
      notify: async () => { state.notifies++; },
    } as any,
  );
  return { s, state };
}
// 用真实 epaySign 给 query 补上合法签名（epaySign 会忽略 sign 字段本身）
const signed = (s: any, q: Record<string, string>) => ({ ...q, sign: s.epaySign(q, 'key456') });

describe('PayService.handleEpayNotify — 回调验签 / 金额 / 到账 / 幂等', () => {
  test('未配置 key → fail', async () => {
    const { s } = svc({ key: '' });
    expect(await s.handleEpayNotify({ out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS' })).toBe('fail');
  });

  test('签名错误 / 缺签名 → fail，不到账', async () => {
    const { s, state } = svc({ order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 100, amount: '1.00', status: 'pending' } });
    expect(await s.handleEpayNotify({ out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS', sign: 'WRONG' })).toBe('fail');
    expect(await s.handleEpayNotify({ out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS' })).toBe('fail');
    expect(state.awards).toHaveLength(0);
  });

  test('trade_status 非 TRADE_SUCCESS → fail，不到账（即便签名合法）', async () => {
    const { s, state } = svc({ order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 100, amount: '1.00', status: 'pending' } });
    const q = signed(s, { out_trade_no: 'E1', trade_status: 'TRADE_CLOSED' });
    expect(await s.handleEpayNotify(q)).toBe('fail');
    expect(state.awards).toHaveLength(0);
  });

  test('订单不存在 → fail', async () => {
    const { s } = svc({ order: null });
    const q = signed(s, { out_trade_no: 'NOPE', trade_status: 'TRADE_SUCCESS', money: '1.00' });
    expect(await s.handleEpayNotify(q)).toBe('fail');
  });

  test('金额与订单不符 → fail，不到账', async () => {
    const { s, state } = svc({ order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 5000, amount: '1.00', status: 'pending' } });
    const q = signed(s, { out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS', money: '0.01' });
    expect(await s.handleEpayNotify(q)).toBe('fail');
    expect(state.awards).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  test('正常回调（pending 订单）→ success，恰好到账一次并原子标记 paid', async () => {
    const { s, state } = svc({ order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 5000, amount: '1.00', status: 'pending' } });
    const q = signed(s, { out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS', trade_no: 'TX1', money: '1.00' });
    expect(await s.handleEpayNotify(q)).toBe('success');
    expect(state.awards).toEqual([{ uid: 7, points: 5000 }]);
    expect(state.updates[0].criteria).toMatchObject({ id: 1, status: 'pending' });
    expect(state.updates[0].patch.status).toBe('paid');
    expect(state.updates[0].patch.trade_no).toBe('TX1');
  });

  test('并发幂等：原子 UPDATE 未抢到（affected=0）→ success 但绝不二次到账', async () => {
    const { s, state } = svc({
      order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 5000, amount: '1.00', status: 'pending' },
      updateAffected: 0,
    });
    const q = signed(s, { out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS', money: '1.00' });
    expect(await s.handleEpayNotify(q)).toBe('success');
    expect(state.updates).toHaveLength(1);
    expect(state.awards).toHaveLength(0); // 另一并发请求已到账
  });

  test('幂等：已 paid 订单重复回调 → success 但绝不二次到账/不再改库', async () => {
    const { s, state } = svc({ order: { id: 1, out_trade_no: 'E1', user_id: 7, points: 5000, amount: '1.00', status: 'paid' } });
    const q = signed(s, { out_trade_no: 'E1', trade_status: 'TRADE_SUCCESS', trade_no: 'TX2', money: '1.00' });
    expect(await s.handleEpayNotify(q)).toBe('success');
    expect(state.awards).toHaveLength(0);       // 关键：不二次发积分
    expect(state.updates).toHaveLength(0);      // 不再改库
  });
});
