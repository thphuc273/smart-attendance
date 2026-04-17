import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const DATE_ONLY_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateEmployeeDto {
  @ApiProperty({ example: 'new@demo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Temp@123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Nguyễn Văn B' })
  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'EMP031' })
  @IsString()
  @IsNotEmpty()
  employee_code!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  primary_branch_id!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  department_id?: string;

  @ApiPropertyOptional({ enum: ['admin', 'manager', 'employee'], default: 'employee' })
  @IsOptional()
  @IsEnum(['admin', 'manager', 'employee'])
  role?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  department_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  primary_branch_id?: string;

  @ApiPropertyOptional({ enum: ['active', 'on_leave', 'terminated'] })
  @IsOptional()
  @IsEnum(['active', 'on_leave', 'terminated'])
  employment_status?: string;
}

export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branch_id!: string;

  @ApiPropertyOptional({ enum: ['primary', 'secondary', 'temporary'], default: 'secondary' })
  @IsOptional()
  @IsEnum(['primary', 'secondary', 'temporary'])
  assignment_type?: string;

  @ApiProperty({ example: '2026-04-15' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'effective_from must be YYYY-MM-DD' })
  effective_from!: string;

  @ApiPropertyOptional({ example: '2026-05-15' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'effective_to must be YYYY-MM-DD' })
  effective_to?: string;
}

export class ToggleDeviceTrustDto {
  @ApiProperty({ example: true })
  @IsNotEmpty()
  is_trusted!: boolean;
}
