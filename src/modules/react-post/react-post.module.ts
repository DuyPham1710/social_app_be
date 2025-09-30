import { Module } from '@nestjs/common';
import { ReactPostService } from './react-post.service';
import { ReactPostController } from './react-post.controller';

@Module({
  controllers: [ReactPostController],
  providers: [ReactPostService],
})
export class ReactPostModule {}
