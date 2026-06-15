import { Module, forwardRef } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './schemas/post.schema';
import { PostUrl, PostUrlSchema } from './schemas/post-url.schema';
import { PostReport, PostReportSchema } from './schemas/post-report.schema';
import { PostView, PostViewSchema } from './schemas/post-view.schema';
import { NotificationModule } from '../notification/notification.module';
import { GoogleTranslationService } from 'src/shared/translation/google-translation.service';
import { RecommendationsModule } from 'src/recommendations/recommendations.module';

@Module({
  controllers: [PostController],
  providers: [PostService, GoogleTranslationService],
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: PostUrl.name, schema: PostUrlSchema },
      { name: PostReport.name, schema: PostReportSchema },
      { name: PostView.name, schema: PostViewSchema },
    ]),
    forwardRef(() => NotificationModule),
    RecommendationsModule,
  ],
  exports: [PostService],
})
export class PostModule { }
