import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 统一错误响应结构：{ statusCode, message, success:false, path, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw = exception?.response || exception?.message || 'Internal Server Error';
    const message = typeof raw === 'object' ? raw.message : raw;

    response.status(status).json({
      statusCode: status,
      message,
      success: false,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
