import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CheckInDto } from '../../attendance/dto/check-in.dto';

export class QrCheckInDto extends CheckInDto {
  @ApiProperty({ example: 'v1.xxxxx.yyyyy' })
  @IsString()
  @IsNotEmpty()
  qr_token!: string;

  @ApiProperty({ example: 'branch-uuid' })
  @IsString()
  @IsNotEmpty()
  branch_id!: string;
}
