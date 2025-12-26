import { Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { FriendGateway } from './friend.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { Friend, FriendSchema } from './schemas/friend.schemas';
import { FriendRequest, FriendRequestSchema } from './schemas/friend-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: FriendRequest.name, schema: FriendRequestSchema },
    ])
  ],
  controllers: [FriendsController],
  providers: [FriendsService, FriendGateway],
  exports: [FriendsService],
})
export class FriendsModule {}
