import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { ThirdPartyConfigService } from './third-party-config.service';

@ApiTags('ThirdPartyConfig')
@ApiBearerAuth()
@Controller('third-party-config')
export class ThirdPartyConfigController {
  constructor(private readonly service: ThirdPartyConfigService) {}
  @Get('overview')
  @ApiOperation({ summary: '仅返回当前用户有读取权限的第三方服务配置概况' })
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user);
  }
  @Get('options')
  @ApiOperation({ summary: '业务表单使用的无凭据服务选项' })
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user);
  }
}
