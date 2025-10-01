import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StoryService } from './story.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('story')
export class StoryController {
  constructor(private readonly storyService: StoryService) { }

  @Post()
  @ApiOperation({ summary: 'Tạo story' })
  createStory(@Req() req: any, @Body() createStoryDto: CreateStoryDto) {
    const userId = req.user.userId;
    return this.storyService.createStory(createStoryDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách story của user đang đăng nhập' })
  getStories(@Req() req: any) {
    const ownerId = req.user.userId;
    return this.storyService.getStories(ownerId, ownerId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Lấy danh sách story của user khác' })
  getStoriesByUserId(@Param('userId') ownerId: string, @Req() req: any) {
    const viewerId = req.user.userId;
    return this.storyService.getStories(ownerId, viewerId);
  }

  @Delete(':storyId')
  @ApiOperation({ summary: 'Xóa story' })
  deleteStory(@Param('storyId') storyId: string, @Req() req: any) {
    const ownerId = req.user.userId;
    return this.storyService.deleteStory(storyId, ownerId);
  }

  // api privacy
  @Get('/privacy/:storyId')
  @ApiOperation({ summary: 'Lấy quyền riêng tư của tin' })
  getStoryPrivacy(@Param('storyId') storyId: string) {
    return this.storyService.getStoryPrivacy(storyId);
  }

  @Patch('/privacy/:storyId')
  @ApiOperation({ summary: 'Cập nhật quyền riêng tư của tin' })
  updateStoryPrivacy(@Param('storyId') storyId: string, @Body() updatePostPrivacyDto: UpdatePrivacyDto) {
    return this.storyService.updateStoryPrivacy(storyId, updatePostPrivacyDto);
  }

  @Get(':storyId/check-privacy')
  @ApiOperation({ summary: 'Kiểm tra quyền riêng tư của tin' })
  async checkStoryPrivacy(
    @Param('storyId') storyId: string,
    @Req() req,
  ) {
    const viewerId = req.user.userId;
    const canView = await this.storyService.canUserViewStory(storyId, viewerId);

    return { canView };
  }
}
