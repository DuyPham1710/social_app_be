import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HuggingFaceModule } from 'src/ai/huggingface/huggingface.module';
import { CommunityMember, CommunityMemberSchema } from 'src/modules/community/schemas/community_member.schema';
import { Post, PostSchema } from 'src/modules/post/schemas/post.schema';
import { RecommendationsController } from './recommendations.controller';
import {
  UserCategoryPreference,
  UserCategoryPreferenceSchema,
} from './schemas/user-category-preference.schema';
import {
  UserPostView,
  UserPostViewSchema,
} from './schemas/user-post-view.schema';
import { PostCategoryClassifierService } from './services/post-category-classifier.service';
import { RecommendationFeedService } from './services/recommendation-feed.service';
import { RecommendationInteractionService } from './services/recommendation-interaction.service';
import { RuleBasedPostCategoryService } from './services/rule-based-post-category.service';

@Module({
  imports: [
    HuggingFaceModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      {
        name: UserCategoryPreference.name,
        schema: UserCategoryPreferenceSchema,
      },
      { name: UserPostView.name, schema: UserPostViewSchema },
      { name: CommunityMember.name, schema: CommunityMemberSchema },
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [
    RuleBasedPostCategoryService,
    PostCategoryClassifierService,
    RecommendationFeedService,
    RecommendationInteractionService,
  ],
  exports: [
    RuleBasedPostCategoryService,
    PostCategoryClassifierService,
    RecommendationFeedService,
    RecommendationInteractionService,
  ],
})
export class RecommendationsModule {}
