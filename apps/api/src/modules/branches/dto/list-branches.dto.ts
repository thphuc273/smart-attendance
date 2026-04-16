import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BranchStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListBranchesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
