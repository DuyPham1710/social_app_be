import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { UserModule } from 'src/modules/user/user.module'; // nếu cần populate user
import { NotificationListener } from './notification.listener';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
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



