import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, IsOptional, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvSchema {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsNumber()
  API_PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number;

  // Secrets must carry enough entropy to resist offline brute-force of
  // signed tokens — reject anything shorter than 32 chars at boot.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_TTL!: string;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_LOGIN_PER_MINUTE?: number;

  @IsString()
  @IsOptional()
  ALLOWED_ORIGINS?: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsNumber()
  @IsOptional()
  AI_CACHE_TTL?: number;
}

export function validateEnv(raw: Record<string, unknown>) {
  const parsed = plainToInstance(EnvSchema, raw, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const message = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${message}`);
  }
  return parsed;
}
