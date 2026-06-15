import { Module } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentGateway } from './comment.gateway';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { CommentLog, CommentLogSchema } from './schemas/comment-log.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationModule } from '../notification/notification.module';
import { RecommendationsModule } from 'src/modules/recommendations/recommendations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: CommentLog.name, schema: CommentLogSchema },
    ]),
    NotificationModule,
    RecommendationsModule,
  ],
  providers: [CommentGateway, CommentService],
  exports: [CommentService],
})
export class CommentModule {}
