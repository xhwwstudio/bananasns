import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { User } from '../../database/entities';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { VerificationService } from './verification.service';
import {
  ChangePasswordDto,
  ChangeUsernameDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto';

/**
 * /api/auth — register, login, me, password, checkin, change-username.
 * Endpoint paths and JSON shapes match server/src/routes/auth.js exactly.
 */
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly verification: VerificationService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.auth.register(dto, ip);
  }

  @Post('sms/send')
  sendSms(@Body('phone') phone: string, @Ip() ip: string) {
    return this.verification.sendPhoneCode(phone, ip);
  }

  @Post('email/send')
  sendEmail(@Body('email') email: string, @Ip() ip: string) {
    return this.verification.sendEmailCode(email, ip);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return this.auth.me(user);
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  @Post('checkin')
  @UseGuards(JwtAuthGuard)
  checkin(@CurrentUser() user: User) {
    return this.auth.checkin(user);
  }

  @Post('change-username')
  @UseGuards(JwtAuthGuard)
  changeUsername(@CurrentUser() user: User, @Body() dto: ChangeUsernameDto) {
    return this.auth.changeUsername(user, dto);
  }
}
