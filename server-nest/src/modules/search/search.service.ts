import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like as TypeOrmLike, Repository } from 'typeorm';
import { Post, Thread, Topic, User } from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { PostsService } from '../posts/posts.service';
import { visibilityWhere } from '../../common/post-visibility';

/**
 * Ported from server/src/routes/search.js. Trending keywords and a global
 * search across users, posts, threads and topics. Reuses publicUser /
 * serializePost so the shapes match the Express version.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Thread) private readonly threads: Repository<Thread>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    private readonly helpers: HelpersService,
    private readonly postsService: PostsService,
  ) {}

  // ---- GET /api/search/trending ----
  async trending() {
    const rows = await this.topics.find({
      order: { hot: 'DESC' },
      take: 8,
      select: ['name'],
    });
    return { keywords: rows.map((t) => t.name) };
  }

  // ---- GET /api/search ----
  async search(q: string, viewer: User | null) {
    const query = (q || '').trim();
    if (!query) return { users: [], posts: [], threads: [], topics: [] };
    const viewerId = viewer?.id || null;
    const like = `%${query}%`;

    const userRows = await this.users
      .createQueryBuilder('u')
      .where('u.nickname LIKE :like OR u.username LIKE :like', { like })
      .limit(10)
      .getMany();
    const vis = visibilityWhere(viewerId);
    const postRows = await this.posts
      .createQueryBuilder('p')
      .where('p.content LIKE :like', { like })
      .andWhere(vis.sql, vis.params)
      .orderBy('p.created_at', 'DESC')
      .limit(20)
      .getMany();
    const threadRows = await this.threads
      .createQueryBuilder('t')
      .where('t.title LIKE :like OR t.content LIKE :like', { like })
      .orderBy('t.created_at', 'DESC')
      .limit(20)
      .getMany();
    const topicRows = await this.topics.find({
      where: { name: TypeOrmLike(like) },
      order: { hot: 'DESC' },
      take: 10,
    });

    const users: any[] = [];
    for (const u of userRows)
      users.push(await this.helpers.publicUser(u, viewerId));
    const posts: any[] = [];
    for (const p of postRows) {
      const s = await this.postsService.serializePost(p, viewerId);
      if (s) posts.push(s);
    }

    return {
      users,
      posts,
      threads: threadRows.map((t) => ({
        id: t.id,
        title: t.title,
        replyCount: t.reply_count,
      })),
      topics: topicRows,
    };
  }
}
