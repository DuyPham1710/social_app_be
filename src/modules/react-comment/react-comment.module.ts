import { Module } from '@nestjs/common';
import { ReactCommentService } from './react-comment.service';
import { ReactCommentController } from './react-comment.controller';

@Module({
  controllers: [ReactCommentController],
  providers: [ReactCommentService],
})
export class ReactCommentModule {}
