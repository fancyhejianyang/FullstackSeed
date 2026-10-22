import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { UploadedStorageFile } from '../uploads/uploads.service';
import { ComfyMaterialsService } from './comfy-materials.service';
import {
  BatchIdsDto,
  QueryComfyMaterialDto,
  UpdateComfyMaterialGroupFavoriteDto,
  UpdateComfyMaterialDto,
} from './dto/comfyui.dto';

@ApiTags('ComfyMaterial')
@ApiBearerAuth()
@Controller('comfyui/materials')
export class ComfyMaterialsController {
  constructor(private readonly service: ComfyMaterialsService) {}

  @Get()
  @RequirePermissions('ComfyMaterial.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryComfyMaterialDto,
  ) {
    return this.service.findAll(user.userId, query);
  }

  @Get('options')
  @RequirePermissions('ComfyTask.read')
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user.userId);
  }

  @Post('upload')
  @RequirePermissions('ComfyMaterial.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedStorageFile,
    @Body('name') name?: string,
  ) {
    if (!file) throw new BadRequestException('请上传素材文件');
    return this.service.upload(user.userId, file, name);
  }

  @Post('task-input')
  @RequirePermissions('ComfyTask.create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
  )
  uploadTaskInput(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedStorageFile,
    @Body('name') name?: string,
  ) {
    if (!file) throw new BadRequestException('请上传任务参考文件');
    return this.service.uploadTaskInput(user.userId, file, name);
  }

  @Patch('group/favorite')
  @RequirePermissions('ComfyMaterial.update')
  updateGroupFavorite(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateComfyMaterialGroupFavoriteDto,
  ) {
    return this.service.updateGroupFavorite(
      dto.ids,
      user.userId,
      dto.isFavorite,
    );
  }

  @Delete('group')
  @RequirePermissions('ComfyMaterial.delete')
  removeGroup(@Body() dto: BatchIdsDto, @CurrentUser() user: AuthUser) {
    return this.service.batchRemove(dto.ids, user.userId);
  }

  @Patch(':id')
  @RequirePermissions('ComfyMaterial.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateComfyMaterialDto,
  ) {
    return this.service.update(id, user.userId, dto);
  }

  @Delete('batch')
  @RequirePermissions('ComfyMaterial.batchDelete')
  batchRemove(@Body() dto: BatchIdsDto, @CurrentUser() user: AuthUser) {
    return this.service.batchRemove(dto.ids, user.userId);
  }

  @Delete(':id')
  @RequirePermissions('ComfyMaterial.delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }
}
