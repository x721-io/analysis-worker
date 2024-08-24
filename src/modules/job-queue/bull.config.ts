import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import {
  QUEUE_NAME_COLLECTION,
  QUEUE_NAME_CMS,
} from '../../constants/Job.constant';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDISDB_HOST,
        port: parseInt(process.env.REDISDB_PORT),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAME_COLLECTION,
      },
      {
        name: QUEUE_NAME_CMS,
      },
    ),
  ],
  exports: [BullModule],
})
export class BullConfigModule {}
