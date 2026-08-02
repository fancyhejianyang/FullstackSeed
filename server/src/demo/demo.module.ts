import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Demo } from './entities/demo.entity';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Demo])],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
