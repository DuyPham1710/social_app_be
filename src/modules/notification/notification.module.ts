import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { UserModule } from 'src/modules/user/user.module'; // nếu cần populate user
import { NotificationListener } from './notification.listener';
import { PostSchema, Post } from '../post/schemas/post.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Post.name, schema: PostSchema },
    ]),
    forwardRef(() => UserModule), // nếu populate user
  ],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationListener,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}



