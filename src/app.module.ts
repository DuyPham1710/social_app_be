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



@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UserModule,
    AuthModule,
    MailModule,
    CloudinaryModule,
    FriendsModule,
    PostModule,
    ReactPostModule,
    EmojiModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
