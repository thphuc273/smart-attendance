import { Global, Module } from '@nestjs/common';
import { LiveBusService } from './live-bus.service';
import { LiveController } from './live.controller';

@Global()
@Module({
  controllers: [LiveController],
  providers: [LiveBusService],
  exports: [LiveBusService],
})
export class LiveModule {}
