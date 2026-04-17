import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CheckInDto } from '../../attendance/dto/check-in.dto';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ZeroTapCheckInDto extends CheckInDto {
  @ApiProperty({ example: '2a3f7c9b1d4e6b8a12f0a1b2c3d4e5f6' })
  @IsString()
  @IsNotEmpty()
  @Length(16, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'nonce must be url-safe base64' })
  nonce!: string;
}

export class ZeroTapCheckOutDto extends ZeroTapCheckInDto {}

export class PatchZeroTapSettingDto {
  @ApiProperty({ example: 'device-uuid' })
  @IsString()
  @IsNotEmpty()
  device_id!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: false, description: 'Revoke consent — sets revoked_at' })
  @IsOptional()
  @IsBoolean()
  revoke?: boolean;
}

export class UpsertZeroTapPolicyDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ example: '07:30' })
  @IsString()
  @Matches(HHMM_RE, { message: 'window_start must be HH:MM' })
  window_start!: string;

  @ApiProperty({ example: '09:30' })
  @IsString()
  @Matches(HHMM_RE, { message: 'window_end must be HH:MM' })
  window_end!: string;

  @ApiProperty({ example: 600 })
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldown_seconds!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(100)
  min_manual_checkins_to_enable!: number;
}
