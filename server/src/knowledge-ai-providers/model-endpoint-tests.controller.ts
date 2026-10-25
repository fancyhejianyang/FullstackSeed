import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';
import { TestModelEndpointDto } from './dto/model-endpoint-test.dto';

@ApiTags('模型厂商接口测试')
@ApiBearerAuth()
@Controller('model-endpoint-tests')
@RequirePermissions('ModelEndpoint.update')
export class ModelEndpointTestsController {
  constructor(private readonly tests: ModelEndpointTestsService) {}

  @Get(':id/accounts')
  @ApiOperation({ summary: '当前接口同平台且已登记模型的测试账号（无凭据）' })
  accounts(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.options(id, user.userId);
  }

  @Post(':id')
  @ApiOperation({ summary: '明确发起一次接口测试，可能计费，不自动重投' })
  start(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestModelEndpointDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.start(id, dto, user.userId);
  }

  @Get(':id/:requestId')
  @ApiOperation({ summary: '读取测试结果或查询已受理供应商任务，不重新生成' })
  query(
    @Param('id', ParseIntPipe) id: number,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.query(id, requestId, user.userId);
  }
}
