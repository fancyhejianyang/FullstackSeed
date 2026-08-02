import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MenusService } from './menus.service';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Menus')
@ApiBearerAuth()
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get('mine')
  @ApiOperation({ summary: '当前用户可见菜单树（按权限过滤）' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.menusService.findMine(user.isAdmin, user.permissions);
  }

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '完整菜单树（管理用）' })
  findTree() {
    return this.menusService.findTree();
  }

  @Post()
  @RequirePermissions('Menu.create')
  @ApiOperation({ summary: '创建菜单' })
  create(@Body() dto: CreateMenuDto, @CurrentUser() user: AuthUser) {
    return this.menusService.create(dto, user.isAdmin);
  }

  @Patch(':id')
  @RequirePermissions('Menu.update')
  @ApiOperation({ summary: '更新菜单' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menusService.update(id, dto, user.isAdmin);
  }

  @Delete(':id')
  @RequirePermissions('Menu.delete')
  @ApiOperation({ summary: '删除菜单' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.menusService.remove(id, user.isAdmin);
  }
}
