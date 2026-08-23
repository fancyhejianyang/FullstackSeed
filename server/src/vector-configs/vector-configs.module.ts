import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VectorConfig } from './entities/vector-config.entity';
import { VectorConfigsController } from './vector-configs.controller';
import { VectorConfigsService } from './vector-configs.service';

@Module({
  imports: [TypeOrmModule.forFeature([VectorConfig])],
  controllers: [VectorConfigsController],
  providers: [VectorConfigsService],
  exports: [VectorConfigsService],
})
export class VectorConfigsModule {}
