import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReactPostController } from './react-post.controller';
import { ReactPostService } from './react-post.service';
import { ReactPost, ReactPostSchema } from './schemas/react-post.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ReactPost.name, schema: ReactPostSchema }])],
  controllers: [ReactPostController],
  providers: [ReactPostService],
  exports: [ReactPostService],
})
export class ReactPostModule {}
