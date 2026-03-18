import { Module } from '@nestjs/common';
import { ReactCommentController } from './react-comment.controller';
import { ReactCommentService } from './react-comment.service';
import { ReactionModule } from '../reaction/reaction.module';

@Module({
  imports: [ReactionModule],
  controllers: [ReactCommentController],
  providers: [ReactCommentService],
  exports: [ReactCommentService],
})
export class ReactCommentModule {}