import { Module } from '@nestjs/common';
import { ReactPostController } from './react-post.controller';
import { ReactPostService } from './react-post.service';
import { ReactionModule } from '../reaction/reaction.module';
import { RecommendationsModule } from 'src/modules/recommendations/recommendations.module';

@Module({
  imports: [ReactionModule, RecommendationsModule],
  controllers: [ReactPostController],
  providers: [ReactPostService],
  exports: [ReactPostService],
})
export class ReactPostModule {}
