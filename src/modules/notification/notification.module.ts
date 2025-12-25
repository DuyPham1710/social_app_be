import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { UserModule } from 'src/modules/user/user.module';
import { NotificationListener } from './notification.listener';
import { FcmService } from 'src/shared/services/fcm.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    forwardRef(() => UserModule),
  ],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationListener,
    FcmService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}



