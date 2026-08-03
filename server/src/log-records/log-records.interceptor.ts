import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { LogRecordsService } from './log-records.service';

@Injectable()
export class LogRecordsInterceptor implements NestInterceptor {
  constructor(private readonly logRecordsService: LogRecordsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((response) => {
        void this.logRecordsService
          .recordRequestLog(request, response)
          .catch(() => undefined);
      }),
    );
  }
}
