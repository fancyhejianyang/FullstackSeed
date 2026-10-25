import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEndpoint } from './entities/model-endpoint.entity';
import { ModelEndpointsService } from './model-endpoints.service';
import { ModelEndpointsController } from './model-endpoints.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ModelEndpoint])],
  controllers: [ModelEndpointsController],
  providers: [ModelEndpointsService],
  exports: [ModelEndpointsService],
})
export class ModelEndpointsModule {}
