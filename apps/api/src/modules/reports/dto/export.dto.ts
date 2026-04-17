import { IsDateString, IsIn, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExportDto {
  @ApiProperty({ enum: ['attendance_csv'] })
  @IsIn(['attendance_csv'])
  type!: 'attendance_csv';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  date_from!: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  date_to!: string;
}
