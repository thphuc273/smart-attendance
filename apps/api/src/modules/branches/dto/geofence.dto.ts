import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateGeofenceDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsLatitude()
  center_lat!: number;

  @IsLongitude()
  center_lng!: number;

  @IsInt()
  @Min(10)
  @Max(5000)
  radius_meters!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
