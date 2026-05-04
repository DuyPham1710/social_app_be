import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/modules/user/schemas/user.schema';
import { PresenceService } from './services/presence.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}

