import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @Length(1, 32)
  code!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  radius_meters?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
