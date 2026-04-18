import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class ChatHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class WeeklyInsightsQueryDto {
  @IsOptional()
  @IsString()
  branch_id?: string;

  @IsOptional()
  @IsString()
  week_start?: string;
}
