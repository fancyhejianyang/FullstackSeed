import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MineruConfig } from './entities/mineru-config.entity';
import { MineruConfigsController } from './mineru-configs.controller';
import { MineruConfigsService } from './mineru-configs.service';

@Module({
  imports: [TypeOrmModule.forFeature([MineruConfig])],
  controllers: [MineruConfigsController],
  providers: [MineruConfigsService],
  exports: [MineruConfigsService],
})
export class MineruConfigsModule {}
