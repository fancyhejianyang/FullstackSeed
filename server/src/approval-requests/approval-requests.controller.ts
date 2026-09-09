import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  ApproveApprovalRequestDto,
  QueryApprovalRequestDto,
  RejectApprovalRequestDto,
} from './dto/approval-request.dto';
import { ApprovalRequestsService } from './approval-requests.service';

@ApiTags('ApprovalRequest')
@ApiBearerAuth()
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(
    private readonly approvalRequestsService: ApprovalRequestsService,
  ) {}

  @Get()
  @RequirePermissions('ApprovalRequest.read')
  @ApiOperation({ summary: '分页查询审批记录' })
  findAll(@Query() query: QueryApprovalRequestDto) {
    return this.approvalRequestsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('ApprovalRequest.read')
  @ApiOperation({ summary: '查询审批详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.approvalRequestsService.findOne(id);
  }

  @Post('standard-qas/:id/submit')
  @RequirePermissions('KnowledgeStandardQa.update')
  @ApiOperation({ summary: '提交标准问答审批' })
  submitStandardQa(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() applicant: AuthUser,
  ) {
    return this.approvalRequestsService.submitStandardQa(id, applicant);
  }

  @Post(':id/approve')
  @RequirePermissions('ApprovalRequest.update')
  @ApiOperation({ summary: '管理员通过审批' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveApprovalRequestDto,
    @CurrentUser() reviewer: AuthUser,
  ) {
    return this.approvalRequestsService.approve(id, dto, reviewer);
  }

  @Post(':id/reject')
  @RequirePermissions('ApprovalRequest.update')
  @ApiOperation({ summary: '管理员驳回审批' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectApprovalRequestDto,
    @CurrentUser() reviewer: AuthUser,
  ) {
    return this.approvalRequestsService.reject(id, dto, reviewer);
  }
}
