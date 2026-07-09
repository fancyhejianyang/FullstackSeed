import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  statusCode: number;
  message: string;
  success: boolean;
  timestamp: string;
}

/**
 * 统一成功响应结构：{ statusCode, data, success, message, timestamp }
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const statusCode = ctx.getResponse().statusCode;

    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode,
        message: 'Success',
        success: true,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
