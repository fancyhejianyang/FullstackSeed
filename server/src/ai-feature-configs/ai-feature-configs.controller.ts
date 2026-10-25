import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { AiFeatureConfigsService } from './ai-feature-configs.service';
import {
  BatchDeleteAiFeatureConfigDto,
  CheckAiFeatureModelEndpointDto,
  CreateAiFeatureConfigDto,
  QueryAiFeatureConfigDto,
  UpdateAiFeatureConfigDto,
  TestAiFeatureModelDto,
} from './dto/ai-feature-config.dto';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { ModelEndpointTestsService } from '../knowledge-ai-providers/model-endpoint-tests.service';

@ApiTags('AiFeatureConfig')
@ApiBearerAuth()
@Controller('ai-feature-configs')
export class AiFeatureConfigsController {
  constructor(
    private readonly configsService: AiFeatureConfigsService,
    private readonly tests: ModelEndpointTestsService,
  ) {}

  @Post('test-model')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '实际测试当前所选模型，可能计费，不保存业务配置' })
  testModel(@Body() dto: TestAiFeatureModelDto, @CurrentUser() user: AuthUser) {
    return this.tests.startFeature(dto, user.userId);
  }

  @Get('model-tests')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '本人最近十次功能模型测试，不重新调用模型' })
  recentModelTests(@CurrentUser() user: AuthUser) {
    return this.tests.recentFeatures(user.userId);
  }

  @Get('model-tests/:requestId')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '读取功能模型测试或查询原任务，不重新生成' })
  queryModelTest(
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.queryFeature(requestId, user.userId);
  }

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询 AI 功能配置' })
  findAll(@Query() query: QueryAiFeatureConfigDto) {
    return this.configsService.findAll(query);
  }

  @Post('check-model-endpoint')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '检查功能模型对应接口配置（不调用供应商）' })
  checkModelEndpoint(@Body() dto: CheckAiFeatureModelEndpointDto) {
    return this.configsService.checkModelEndpoint(dto);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: 'AI 功能配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建 AI 功能配置' })
  create(@Body() dto: CreateAiFeatureConfigDto) {
    return this.configsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新 AI 功能配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiFeatureConfigDto,
  ) {
    return this.configsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除 AI 功能配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除 AI 功能配置' })
  batchRemove(@Body() dto: BatchDeleteAiFeatureConfigDto) {
    return this.configsService.batchRemove(dto.ids);
  }
}
