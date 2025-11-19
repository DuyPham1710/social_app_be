import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PostModule } from '../post/post.module';
import { StoryModule } from '../story/story.module';
import { ReactPostModule } from '../react-post/react-post.module';
import { ReactStoryModule } from '../react-story/react-story.module';
import { CommentModule } from '../comment/comment.module';

@Module({
  imports: [PostModule, StoryModule, ReactPostModule, ReactStoryModule, CommentModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule { }
