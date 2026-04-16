import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AttendanceSessionStatus } from '@prisma/client';

export class ListMyAttendanceDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_to?: Date;
}

export class ListSessionsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branch_id?: string;

  @IsOptional()
  @IsString()
  employee_id?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_to?: Date;

  @IsOptional()
  @IsEnum(AttendanceSessionStatus)
  status?: AttendanceSessionStatus;
}

export class OverrideSessionDto {
  @IsEnum(AttendanceSessionStatus)
  status!: AttendanceSessionStatus;

  @IsString()
  note!: string;
}
