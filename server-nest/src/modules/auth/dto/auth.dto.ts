import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Validation kept intentionally light at the DTO layer so the service can
 * reproduce the exact Chinese error messages/HTTP codes from the Express
 * routes (e.g. '用户名和密码必填', '密码至少 6 位').
 */
export class RegisterDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteCode?: string; // 邀请人的用户名（可选）

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  phoneCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emailCode?: string;
}

export class LoginDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  oldPassword?: string;

  @IsOptional()
  @IsString()
  newPassword?: string;
}

export class ChangeUsernameDto {
  @IsOptional()
  @IsString()
  username?: string;
}
