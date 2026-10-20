#!/usr/bin/env node
/**
 * seed-demo.mjs — 一键为全新的 BananaSNS 部署填充少量得体的演示内容
 * ------------------------------------------------------------------
 * 全新安装的信息流是空的，访客/客户第一眼看到"空社区"观感很差。
 * 本脚本通过**公开 HTTP API**（注册 / 发帖 / 关注 / 点赞 / 评论）造一批
 * 轻社交风格（类似 FB / Instagram）的示例账号与动态，让首页立刻"有人气"。
 *
 * 特点：
 *   - 纯 Node，无第三方依赖（用内置 fetch，需 Node 18+）。
 *   - 幂等：重复运行不会重复发帖——已存在的账号会跳过发帖，只有新注册的账号才发。
 *   - 只用公开接口，不直接写库，故对任意部署（本地/宝塔/1Panel/云）都通用。
 *   - 默认纯文字动态（配文与内容一致、无外链图）；加 --images 用 picsum 占位图。
 *
 * 用法：
 *   node scripts/seed-demo.mjs --base http://127.0.0.1:4000
 *   node scripts/seed-demo.mjs --base https://your-domain           # 线上
 *   node scripts/seed-demo.mjs --base <url> --prefix _qa_           # 造可清理的测试数据
 *   node scripts/seed-demo.mjs --base <url> --password 'xxx' --images
 *
 * 提示：若站点开了「防批量注册」(anti_bulk_reg)，请先在后台临时关闭再运行，
 *       否则同一 IP 会触发每日注册名额/最小间隔限制。全新安装默认是关的。
 *
 * 清理（若不想要这些演示账号）：按下方 USERS 里的 username（含 --prefix）
 *       在后台或数据库删除对应用户即可。
 */

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true; // 布尔 flag 无值
}
const BASE = String(arg('base', process.env.SEED_BASE || 'http://127.0.0.1:4000')).replace(/\/$/, '');
const PREFIX = arg('prefix', process.env.SEED_PREFIX || '') === true ? '' : String(arg('prefix', process.env.SEED_PREFIX || ''));
const PASSWORD = String(arg('password', process.env.SEED_PASSWORD || 'demo123456'));
const IMAGES = arg('images', false) === true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, json };
}

// 图片占位（仅 --images 时用）；seed 保证稳定不变
const img = (seed) => ({ type: 'image', url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/900/900` });

/**
 * 演示账号与内容——轻社交/生活分享口吻，克制、真实、不堆砌。
 * imgs: 仅在 --images 下附带的占位图 seed 列表。
 */
const USERS = [
  {
    username: 'qinghuan', nickname: '林清欢', bio: '记录生活里的小确幸 ☕️',
    posts: [
      { text: '周末终于把阳台收拾出来了，泡一杯手冲，晒着太阳看会儿书，这就是我理想的下午 ☀️📖', imgs: ['balcony'] },
      { text: '楼下新开的面包店，可颂酥到掉渣，幸福感直接拉满 🥐 #周末日常#' },
      { text: '养了三年的绿萝又冒新叶了，这点成就感居然比加班做完项目还强，哈哈' },
    ],
  },
  {
    username: 'chenyu', nickname: '陈屿', bio: '在路上 | 摄影 & 徒步 📷',
    posts: [
      { text: '上周末去了趟郊外的湖，清晨的雾还没散，安静得只听得见鸟叫 🏞️', imgs: ['lake-morning'] },
      { text: '随手拍的日落，什么滤镜都比不过真实的天空 🌅 #光影#', imgs: ['sunset'] },
    ],
  },
  {
    username: 'suwan', nickname: '苏晚', bio: '猫奴 🐱 | 爱做饭',
    posts: [
      { text: '今天猫主子难得赏脸，让我抱了整整三分钟，受宠若惊 🐈', imgs: ['cat'] },
      { text: '第一次做提拉米苏，卖相一般但味道居然还挺正！下次继续练 🍰', imgs: ['dessert'] },
      { text: '深夜放毒：番茄牛腩面，汤头熬了两个小时，值了 🍜' },
    ],
  },
  {
    username: 'azhe', nickname: '阿哲', bio: '程序员 | 健身 | 摸鱼选手',
    posts: [
      { text: '健身第 30 天打卡，卧推终于突破 60kg，坚持真的有用 💪 #自律#' },
      { text: '周五下班的心情，是任何 bug 都影响不了的 🎉' },
    ],
  },
  {
    username: 'wenrou', nickname: '温柔一刀', bio: '插画练习生 ✏️',
    posts: [
      { text: '最近在练水彩，画了小区门口那棵老树，色彩还差点意思，继续加油 🎨', imgs: ['watercolor'] },
      { text: '灵感来的时候真的爽，一口气画了三张，停不下来 😆' },
    ],
  },
  {
    username: 'laozhou', nickname: '老周', bio: '咖啡 & 慢生活',
    posts: [
      { text: '换了把新的手冲壶，水流稳多了，一杯耶加雪菲喝出了花香 ☕️', imgs: ['coffee'] },
      { text: '生活可以慢一点，反正日子也不会因为你着急就变好，对吧 🌿' },
    ],
  },
];

// 评论（作者索引 → 目标帖子作者索引 → 文案），营造互动氛围
const COMMENTS = [
  [2, 0, '太治愈了，也想要这样的阳台 🥺'],
  [5, 1, '这张湖景绝了，求原图当壁纸！'],
  [0, 2, '同款猫奴握手 🐱 好可爱'],
  [3, 4, '画得很有味道啊，比我强多了 👍'],
  [1, 5, '慢生活才是真正的奢侈，认同'],
  [4, 3, '自律的人最帅，坚持住！💪'],
];

async function main() {
  console.log(`\n▶ seeding demo content → ${BASE}  (prefix='${PREFIX}', images=${IMAGES})\n`);
  const created = []; // { idx, id, username, token, isNew, postIds:[] }

  // 1) 注册/登录 + 发帖
  for (let idx = 0; idx < USERS.length; idx++) {
    const u = USERS[idx];
    const username = `${PREFIX}${u.username}`;
    let token = null, id = null, isNew = false;

    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { username, password: PASSWORD, nickname: u.nickname },
    });
    if (reg.status === 200 || reg.status === 201) {
      token = reg.json?.token; id = reg.json?.user?.id; isNew = true;
    } else if (reg.status === 409) {
      const login = await api('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
      token = login.json?.token; id = login.json?.user?.id; isNew = false;
    } else if (reg.status === 429) {
      console.log(`  ⚠️ ${username}: 被限流(429) — ${reg.json?.message || ''}；请关闭防批量注册后重试，跳过`);
      continue;
    } else {
      console.log(`  ✗ ${username}: 注册失败 status=${reg.status} ${JSON.stringify(reg.json)}`);
      continue;
    }
    if (!token || !id) { console.log(`  ✗ ${username}: 未拿到 token/id，跳过`); continue; }

    const rec = { idx, id, username, token, isNew, postIds: [] };
    created[idx] = rec;

    if (isNew) {
      for (const p of u.posts) {
        const media = IMAGES && p.imgs ? p.imgs.map(img) : [];
        const body = media.length ? { content: p.text, media, mediaType: 'image' } : { content: p.text };
        const r = await api('/api/posts', { method: 'POST', token, body });
        if (r.status === 200 || r.status === 201) {
          const pid = r.json?.id ?? r.json?.post?.id;
          if (pid) rec.postIds.push(pid);
        } else if (r.status === 429) {
          await sleep(1500); // 命中发帖限流则稍等再继续
        } else {
          console.log(`  · ${username}: 发帖 status=${r.status}`);
        }
        await sleep(120);
      }
      console.log(`  ✓ ${u.nickname} (@${username}) 新建，发 ${rec.postIds.length} 帖`);
    } else {
      console.log(`  ↩ ${u.nickname} (@${username}) 已存在，跳过发帖（幂等）`);
    }
  }

  const live = created.filter(Boolean);
  const anyNew = live.some((r) => r.isNew);
  if (!anyNew) {
    console.log('\n所有账号均已存在——判定为已 seed，跳过关注/点赞/评论。完成。\n');
    return;
  }

  // 帖子索引表：作者 idx → postIds
  const postsByAuthor = {};
  for (const r of live) postsByAuthor[r.idx] = r.postIds;

  // 2) 关注：每人关注后两位（环状），营造关系网
  console.log('');
  for (const r of live) {
    for (const d of [1, 2]) {
      const target = live[(live.indexOf(r) + d) % live.length];
      if (target && target.id !== r.id) {
        await api(`/api/users/${target.id}/follow`, { method: 'POST', token: r.token });
      }
    }
  }
  console.log('  ✓ 关注关系已建立');

  // 3) 点赞：每人给其他人的帖子点几个赞
  let likes = 0;
  for (const r of live) {
    for (const other of live) {
      if (other.idx === r.idx) continue;
      for (const pid of (postsByAuthor[other.idx] || []).slice(0, 1)) {
        const lr = await api(`/api/posts/${pid}/like`, { method: 'POST', token: r.token });
        if (lr.status < 400) likes++;
      }
    }
  }
  console.log(`  ✓ 点赞 ${likes} 次`);

  // 4) 评论
  let cmts = 0;
  for (const [authorIdx, targetIdx, text] of COMMENTS) {
    const author = live.find((r) => r.idx === authorIdx);
    const pid = (postsByAuthor[targetIdx] || [])[0];
    if (author && pid) {
      const cr = await api('/api/comments', { method: 'POST', token: author.token, body: { postId: pid, content: text } });
      if (cr.status < 400) cmts++;
    }
  }
  console.log(`  ✓ 评论 ${cmts} 条`);

  const totalPosts = live.reduce((s, r) => s + r.postIds.length, 0);
  console.log(`\n✅ 完成：${live.length} 账号 · ${totalPosts} 动态 · ${likes} 赞 · ${cmts} 评论 · 关注网已建立。`);
  console.log(`   打开首页即可看到有人气的信息流。\n`);
}

main().catch((e) => { console.error('seed 失败:', e); process.exit(1); });
