import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminLog, Follow, Notification, Post, SensitiveWordFile, SiteConfig, User, ViewHistory } from '../database/entities';
import { HelpersService } from './helpers.service';
import { SensitiveService } from './sensitive.service';
import { RateLimitService } from './rate-limit.service';
import { JwtAuthGuard, AdminGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';

/**
 * Shared cross-cutting providers: the JWT module (so guards can verify tokens),
 * the ported HelpersService (publicUser/notify/award/parsers), and the auth
 * guards. Marked @Global so feature modules can use guards/helpers freely.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Follow, Post, Notification, ViewHistory, SiteConfig, AdminLog, SensitiveWordFile]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.expiresIn') },
      }),
    }),
  ],
  providers: [HelpersService, SensitiveService, RateLimitService, JwtAuthGuard, AdminGuard, OptionalAuthGuard],
  exports: [
    HelpersService,
    SensitiveService,
    RateLimitService,
    JwtModule,
    JwtAuthGuard,
    AdminGuard,
    OptionalAuthGuard,
    TypeOrmModule,
  ],
})
export class CommonModule {}
