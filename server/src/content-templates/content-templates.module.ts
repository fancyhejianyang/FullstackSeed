import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentTemplate } from './entities/content-template.entity';
import { ContentTemplatesController } from './content-templates.controller';
import { ContentTemplatesService } from './content-templates.service';
@Module({
  imports: [TypeOrmModule.forFeature([ContentTemplate])],
  controllers: [ContentTemplatesController],
  providers: [ContentTemplatesService],
  exports: [ContentTemplatesService],
})
export class ContentTemplatesModule {}
