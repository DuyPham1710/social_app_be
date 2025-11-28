import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Post, PostSchema } from '../post/schemas/post.schema';
import { Story, StorySchema } from '../story/schemas/story.schema';
import { Comment, CommentSchema } from '../comment/schemas/comment.schema';
import { ReactPost, ReactPostSchema } from '../react-post/schemas/react-post.schema';
import { ReactStory, ReactStorySchema } from '../react-story/schemas/react-story.schema';
import { PostModule } from '../post/post.module';
import { StoryModule } from '../story/story.module';
import { CommentModule } from '../comment/comment.module';
import { ReactPostModule } from '../react-post/react-post.module';
import { ReactStoryModule } from '../react-story/react-story.module';
import { FriendsModule } from '../friends/friends.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Post.name, schema: PostSchema },
      { name: Story.name, schema: StorySchema },
      { name: Comment.name, schema: CommentSchema },
      { name: ReactPost.name, schema: ReactPostSchema },
      { name: ReactStory.name, schema: ReactStorySchema },
    ]),
    PostModule,
    StoryModule,
    CommentModule,
    ReactPostModule,
    ReactStoryModule,
    FriendsModule,
    UserModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
