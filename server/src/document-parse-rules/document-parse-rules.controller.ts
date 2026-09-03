import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SaveDocumentParseRuleDto } from './dto/document-parse-rule.dto';
import { DocumentParseRulesService } from './document-parse-rules.service';

@ApiTags('DocumentParseRules')
@ApiBearerAuth()
@Controller('document-parse-rules')
export class DocumentParseRulesController {
  constructor(private readonly service: DocumentParseRulesService) {}

  @Get('current')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '获取当前文档解析规则' })
  findCurrent() {
    return this.service.findCurrent();
  }

  @Post('current')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '保存当前文档解析规则' })
  saveCurrent(@Body() dto: SaveDocumentParseRuleDto) {
    return this.service.saveCurrent(dto);
  }
}
