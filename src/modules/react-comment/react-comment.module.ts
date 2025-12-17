import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReactComment, ReactCommentSchema } from './schemas/react-comment.schema';
import { ReactCommentController } from './react-comment.controller';
import { ReactCommentService } from './react-comment.service';


@Module({
  imports: [MongooseModule.forFeature([{ name: ReactComment.name, schema: ReactCommentSchema }])],
  controllers: [ReactCommentController],
  providers: [ReactCommentService],
  exports: [ReactCommentService],
})
export class ReactCommentModule {}