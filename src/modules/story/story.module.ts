import { Module } from '@nestjs/common';
import { StoryService } from './story.service';
import { StoryController } from './story.controller';
import { Story, StorySchema } from './schemas/story.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Story.name, schema: StorySchema }
    ]),
    FriendsModule
  ],
  controllers: [StoryController],
  providers: [StoryService],
})
export class StoryModule { }
