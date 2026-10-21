import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A 红包 payload attached at post creation time. */
export class RedPacketInputDto {
  @IsOptional()
  points?: number;

  @IsOptional()
  count?: number;

  @IsOptional()
  @IsString()
  blessing?: string;
}

/** A poll payload attached at post creation time. */
export class PollInputDto {
  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsBoolean()
  multi?: boolean;

  @IsOptional()
  @IsInt()
  days?: number;
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsArray()
  media?: any[];

  @IsOptional()
  @IsString()
  mediaType?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  price?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  device?: string;

  // 信息来源（可选）：来源地址必须是 http(s) URL；原作者最长 100。
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceAuthor?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  circleId?: number;

  @IsOptional()
  poll?: PollInputDto;

  @IsOptional()
  redPacket?: RedPacketInputDto;
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsArray()
  media?: any[];

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceAuthor?: string;
}

export class VoteDto {
  @IsOptional()
  @IsArray()
  optionIds?: number[];

  @IsOptional()
  optionId?: number;
}

export class ShareDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;
}

export class RewardDto {
  @IsOptional()
  amount?: number;
}

export class UnlockDto {
  @IsOptional()
  @IsString()
  password?: string;
}
