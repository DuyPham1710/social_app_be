import { Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { FriendGateway } from './friend.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { Friend, FriendSchema } from './schemas/friend.schemas';
import { FriendRequest, FriendRequestSchema } from './schemas/friend-request.schema';
import { FaceCoAppearance, FaceCoAppearanceSchema } from './schemas/face-co-appearance.schema';
import { FaceCoAppearanceService } from './face-co-appearance.service';
import { PresenceModule } from 'src/shared/presence.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
      { name: FaceCoAppearance.name, schema: FaceCoAppearanceSchema },
    ]),
    PresenceModule,
  ],
  controllers: [FriendsController],
  providers: [FriendsService, FriendGateway, FaceCoAppearanceService],
  exports: [FriendsService, FaceCoAppearanceService],
})
export class FriendsModule {}
