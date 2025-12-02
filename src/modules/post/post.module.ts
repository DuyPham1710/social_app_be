import { Module } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './schemas/post.schema';
import { PostUrl, PostUrlSchema } from './schemas/post-url.schema';
import { PostReport, PostReportSchema } from './schemas/post-report.schema';

@Module({
  controllers: [PostController],
  providers: [PostService],
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: PostUrl.name, schema: PostUrlSchema },
      { name: PostReport.name, schema: PostReportSchema },
    ])
  ],
  exports: [PostService],
})
export class PostModule { }
