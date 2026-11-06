import { User } from './user.entity';
import { Post } from './post.entity';
import { Comment } from './comment.entity';
import { Follow } from './follow.entity';
import { Like } from './like.entity';
import { Topic } from './topic.entity';
import { Bookmark } from './bookmark.entity';
import { Block } from './block.entity';
import { Notification } from './notification.entity';
import { Purchase } from './purchase.entity';
import { Reward } from './reward.entity';
import { Product } from './product.entity';
import { Order } from './order.entity';
import { Poll, PollOption, PollVote } from './poll.entity';
import { Circle, CircleMember } from './circle.entity';
import { Message, ConversationSetting } from './message.entity';
import { TopicFollow } from './topic-follow.entity';
import { Question, Answer, AnswerVote } from './qa.entity';
import { Flash } from './flash.entity';
import { NavCategory, NavLink } from './nav.entity';
import { UserBadge, TaskClaim } from './achievement.entity';
import { Report } from './report.entity';
import { Feedback } from './feedback.entity';
import { Board, BoardFollow, Moderator, Thread } from './forum.entity';
import { AiConversation, AiMessage } from './ai.entity';
import { SiteConfig } from './site-config.entity';
import { SiteNotice } from './site-notice.entity';
import { CheckinLog } from './checkin-log.entity';
import { LotteryPrize, LotteryDraw } from './lottery.entity';
import { ViewHistory } from './view-history.entity';
import { Article } from './article.entity';
import { Event, EventSignup } from './event.entity';
import { ThreadSub } from './thread-sub.entity';
import { RedPacket, RedPacketGrab } from './red-packet.entity';
import { BoardPurchase } from './board-purchase.entity';
import { AdminLog } from './admin-log.entity';
import { Collection, CollectionItem } from './collection.entity';
import { CircleMessage } from './circle-message.entity';
import { UserNavLink } from './user-nav-link.entity';
import { PaymentOrder } from './payment-order.entity';
import { SensitiveWordFile } from './sensitive-word-file.entity';

export {
  SiteConfig,
  SiteNotice,
  CheckinLog,
  LotteryPrize,
  LotteryDraw,
  ViewHistory,
  Article,
  Event,
  EventSignup,
  ThreadSub,
  RedPacket,
  RedPacketGrab,
  BoardPurchase,
  AdminLog,
  Collection,
  CollectionItem,
  CircleMessage,
  UserNavLink,
  PaymentOrder,
  User,
  Post,
  Comment,
  Follow,
  Like,
  Topic,
  Bookmark,
  Block,
  Notification,
  Purchase,
  Reward,
  Product,
  Order,
  Poll,
  PollOption,
  PollVote,
  Circle,
  CircleMember,
  Message,
  ConversationSetting,
  TopicFollow,
  Question,
  Answer,
  AnswerVote,
  Flash,
  NavCategory,
  NavLink,
  UserBadge,
  TaskClaim,
  Report,
  Feedback,
  Board,
  BoardFollow,
  Moderator,
  Thread,
  AiConversation,
  AiMessage,
  SensitiveWordFile,
};

/**
 * All entities registered with TypeORM. As later modules are ported
 * (comments/forum/messages/etc.) add their entities here.
 */
export const entities = [
  User,
  Post,
  Comment,
  Follow,
  Like,
  Topic,
  Bookmark,
  Block,
  Notification,
  Purchase,
  Reward,
  Product,
  Order,
  Poll,
  PollOption,
  PollVote,
  Circle,
  CircleMember,
  Message,
  ConversationSetting,
  TopicFollow,
  Question,
  Answer,
  AnswerVote,
  Flash,
  NavCategory,
  NavLink,
  UserBadge,
  TaskClaim,
  Report,
  Feedback,
  Board,
  BoardFollow,
  Moderator,
  Thread,
  AiConversation,
  AiMessage,
  SiteConfig,
  SiteNotice,
  CheckinLog,
  LotteryPrize,
  LotteryDraw,
  ViewHistory,
  Article,
  Event,
  EventSignup,
  ThreadSub,
  RedPacket,
  RedPacketGrab,
  BoardPurchase,
  AdminLog,
  Collection,
  CollectionItem,
  CircleMessage,
  UserNavLink,
  PaymentOrder,
  SensitiveWordFile,
];
