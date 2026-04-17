import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WifiScanEntryDto {
  @ApiProperty({ example: 'Office-5G' })
  @IsString()
  ssid!: string;

  @ApiProperty({ example: 'aa:bb:cc:dd:ee:ff' })
  @IsString()
  bssid!: string;

  @ApiPropertyOptional({ example: -55 })
  @IsOptional()
  @IsInt()
  rssi?: number;
}

export class CheckInDto {
  @ApiProperty({ example: 10.777 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 106.701 })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  accuracy_meters?: number;

  @ApiPropertyOptional({ example: 'Office-5G' })
  @IsOptional()
  @IsString()
  ssid?: string;

  @ApiPropertyOptional({ example: 'aa:bb:cc:dd:ee:ff' })
  @IsOptional()
  @IsString()
  bssid?: string;

  @ApiProperty({ example: 'ios-abc123def456' })
  @IsString()
  @IsNotEmpty()
  device_fingerprint!: string;

  @ApiProperty({ example: 'ios', enum: ['ios', 'android', 'web'] })
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @ApiPropertyOptional({ example: 'iPhone 14' })
  @IsOptional()
  @IsString()
  device_name?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  app_version?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_mock_location?: boolean;

  @ApiPropertyOptional({ type: [WifiScanEntryDto], description: 'Full BSSID scan — backend matches any entry against whitelist.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WifiScanEntryDto)
  wifi_scan?: WifiScanEntryDto[];
}

export class CheckOutDto extends CheckInDto {}
