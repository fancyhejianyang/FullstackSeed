import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ExternalAppsService } from '../external-apps.service';

@Injectable()
export class AppIdGuard implements CanActivate {
  constructor(private readonly externalAppsService: ExternalAppsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      externalApp?: unknown;
    }>();
    const appId = this.resolveAppId(request);
    request.externalApp = await this.externalAppsService.assertUsableAppId(
      appId,
      this.resolveRequestDomain(request),
    );
    return true;
  }

  private resolveAppId(request: {
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }) {
    const header = request.headers['x-app-id'];
    if (Array.isArray(header)) return header[0];
    if (header) return header;

    const queryAppId = request.query?.appId;
    if (typeof queryAppId === 'string') return queryAppId;

    const bodyAppId = request.body?.appId;
    if (typeof bodyAppId === 'string') return bodyAppId;

    throw new UnauthorizedException('缺少 appId');
  }

  private resolveRequestDomain(request: {
    headers: Record<string, string | string[] | undefined>;
  }) {
    const origin = this.firstHeader(request.headers.origin);
    if (origin) return origin;

    const referer = this.firstHeader(request.headers.referer);
    if (referer) return referer;

    return null;
  }

  private firstHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }
}
