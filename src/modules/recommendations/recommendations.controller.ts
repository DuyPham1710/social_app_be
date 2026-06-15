import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { DebugClassifyCaptionDto } from './dto/debug-classify-caption.dto';
import { GetRecommendationFeedQueryDto } from './dto/get-recommendation-feed-query.dto';
import { TrackPostInteractionDto } from './dto/track-post-interaction.dto';
import { PostCategoryClassifierService } from './services/post-category-classifier.service';
import { RecommendationFeedService } from './services/recommendation-feed.service';
import { RecommendationInteractionService } from './services/recommendation-interaction.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationFeedService: RecommendationFeedService,
    private readonly recommendationInteractionService: RecommendationInteractionService,
    private readonly postCategoryClassifierService: PostCategoryClassifierService,
    private readonly configService: ConfigService,
  ) {}

  @Get('feed')
  @ApiOperation({ summary: 'Lấy feed gợi ý bài viết cho user đang đăng nhập' })
  getRecommendedFeed(
    @Req() req: any,
    @Query() query: GetRecommendationFeedQueryDto,
  ) {
    const userId = req.user.userId;
    return this.recommendationFeedService.getRecommendedFeed(userId, query);
  }

  @Post('interactions')
  @ApiOperation({ summary: 'Ghi nhận tương tác bài viết để cập nhật gợi ý' })
  trackInteraction(@Req() req: any, @Body() dto: TrackPostInteractionDto) {
    const userId = req.user.userId;
    return this.recommendationInteractionService.trackInteraction(
      userId,
      dto.postId,
      dto.interactionType,
    );
  }

  @Post('debug/classify')
  @ApiOperation({ summary: 'Debug phân loại caption bài viết' })
  debugClassifyCaption(@Body() dto: DebugClassifyCaptionDto) {
    const debugEnabled =
      this.configService.get<string>('RECOMMENDATION_DEBUG_ENABLED') === 'true';
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction && !debugEnabled) {
      throw new ForbiddenException(
        'Recommendation debug classification is disabled in production',
      );
    }

    return this.postCategoryClassifierService.classifyCaption(dto.caption);
  }
}
