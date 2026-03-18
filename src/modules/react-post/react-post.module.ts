import { Module } from '@nestjs/common';
import { ReactPostController } from './react-post.controller';
import { ReactPostService } from './react-post.service';
import { ReactionModule } from '../reaction/reaction.module';

@Module({
  imports: [ReactionModule],
  controllers: [ReactPostController],
  providers: [ReactPostService],
  exports: [ReactPostService],
})
export class ReactPostModule {}
