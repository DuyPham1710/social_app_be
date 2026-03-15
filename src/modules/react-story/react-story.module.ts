import { Module } from '@nestjs/common';
import { ReactStoryController } from './react-story.controller';
import { ReactStoryService } from './react-story.service';
import { ReactionModule } from '../reaction/reaction.module';

@Module({
  imports: [ReactionModule],
  controllers: [ReactStoryController],
  providers: [ReactStoryService],
  exports: [ReactStoryService],
})
export class ReactStoryModule {}
