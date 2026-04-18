import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'meta' in value &&
    Array.isArray((value as Paginated<T>).items)
  );
}

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, unknown> {
  private readonly reflector = new Reflector();

  intercept(ctx: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    // Skip SSE handlers — wrapping each MessageEvent into { data: ... } breaks
    // the SSE frame format (clients would see nested {"data":{"data":{...}}}).
    const isSse = this.reflector.get<boolean>(SSE_METADATA, ctx.getHandler());
    if (isSse) return next.handle();

    return next.handle().pipe(
      map((value) => {
        if (value === null || value === undefined) return { data: null };
        if (isPaginated<T>(value)) {
          return { data: value.items, meta: value.meta };
        }
        return { data: value };
      }),
    );
  }
}
