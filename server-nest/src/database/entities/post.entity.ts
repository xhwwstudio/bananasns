import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * posts — SNS feed. Columns mirror schema.sql (+ db.js migrations:
 * edited, pinned, global_pin_until, circle_id). `media` is a JSON string
 * exactly as the Express server stored it (JSON.parse on read).
 */
@Entity('posts')
@Index('idx_posts_user', ['user_id'])
@Index('idx_posts_created', ['created_at'])
@Index('idx_posts_topic', ['topic_id'])
@Index('idx_posts_vis', ['visibility'])
@Index('idx_posts_circle', ['circle_id'])
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  user_id: number;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'text', default: '[]' })
  media: string;

  @Column({ name: 'media_type', type: 'varchar', length: 16, default: 'text' })
  media_type: string;

  @Column({ type: 'varchar', length: 16, default: 'public' })
  visibility: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string | null;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 64, default: '' })
  location: string;

  @Column({ type: 'varchar', length: 16, default: '电脑端' })
  device: string;

  // 信息来源（可选）：「来自 原作者」展示，链接到 source_url，新窗口打开。
  @Column({ name: 'source_url', type: 'varchar', length: 500, default: '' })
  source_url: string;

  @Column({ name: 'source_author', type: 'varchar', length: 100, default: '' })
  source_author: string;

  @Column({ name: 'topic_id', type: 'int', nullable: true })
  topic_id: number | null;

  @Column({ name: 'circle_id', type: 'int', nullable: true })
  circle_id: number | null;

  @Column({ name: 'share_of', type: 'int', nullable: true })
  share_of: number | null;

  @Column({ type: 'int', default: 0 })
  views: number;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  like_count: number;

  @Column({ name: 'comment_count', type: 'int', default: 0 })
  comment_count: number;

  @Column({ name: 'share_count', type: 'int', default: 0 })
  share_count: number;

  @Column({ type: 'smallint', default: 0 })
  edited: number;

  @Column({ type: 'smallint', default: 0 })
  pinned: number;

  @Column({ name: 'global_pin_until', type: 'varchar', length: 32, default: '' })
  global_pin_until: string;

  @Column({ name: 'created_at', type: 'varchar', length: 32, nullable: true })
  created_at: string;
}
