import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReactStoryController } from './react-story.controller';
import { ReactStoryService } from './react-story.service';
import { ReactStory, ReactStorySchema } from './schemas/react-story.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ReactStory.name, schema: ReactStorySchema }])],
  controllers: [ReactStoryController],
  providers: [ReactStoryService],
  exports: [ReactStoryService],
})
export class ReactStoryModule {}
