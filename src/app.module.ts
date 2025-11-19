import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database.config';
import { MailModule } from './modules/mail/mail.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { FriendsModule } from './modules/friends/friends.module';
import { PostModule } from './modules/post/post.module';
import { ReactPostModule } from './modules/react-post/react-post.module';
import { EmojiModule } from './modules/emoji/emoji.module';
import { StoryModule } from './modules/story/story.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ReactStoryModule } from './modules/react-story/react-story.module';
import { CommentModule } from './modules/comment/comment.module';
import { ReactCommentModule } from './modules/react-comment/react-comment.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { ChatModule } from './modules/chat/chat.module';
import { AdminModule } from './modules/admin/admin.module';



@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UserModule,
    AuthModule,
    MailModule,
    CloudinaryModule,
    FriendsModule,
    PostModule,
    ReactPostModule,
    EmojiModule,
    StoryModule,
    StoryModule,
    CommentModule,
    ReactStoryModule,
    ReactCommentModule,
    CommentModule,
    PrivacyModule,
    ChatModule,
    AdminModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
