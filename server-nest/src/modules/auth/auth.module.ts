import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckinLog, Order, Product, User } from '../../database/entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { VerificationService } from './verification.service';
import { SiteModule } from '../site/site.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Product, Order, CheckinLog]), SiteModule],
  controllers: [AuthController],
  providers: [AuthService, VerificationService],
  exports: [AuthService],
})
export class AuthModule {}
