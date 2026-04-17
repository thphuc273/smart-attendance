import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateWorkScheduleDto {
  @ApiProperty({ example: 'Standard 8–5' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be HH:MM (24h)' })
  start_time!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be HH:MM (24h)' })
  end_time!: string;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  grace_minutes?: number;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  overtime_after_minutes?: number;

  @ApiProperty({ example: [1, 2, 3, 4, 5], description: 'ISO weekdays (Mon=1..Sun=7)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workdays!: number[];
}

export class AssignScheduleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employee_id!: string;

  @ApiProperty({ example: '2026-04-15' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'effective_from must be YYYY-MM-DD' })
  effective_from!: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'effective_to must be YYYY-MM-DD' })
  effective_to?: string;
}
