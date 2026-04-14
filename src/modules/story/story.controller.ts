import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { StoryService } from './story.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { GroupedStoryListDto } from './dto/grouped-story-list.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { File } from 'multer';
import { diskStorage } from '../cloudinary/multer-disk.storage';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('story')
export class StoryController {
  constructor(private readonly storyService: StoryService) { }

  @Post()
  @ApiOperation({ summary: 'Tạo story' })
  @UseInterceptors(FilesInterceptor('file', 1, { storage: diskStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateStoryDto })
  createStory(
    @Req() req: any,
    @Body() createStoryDto: CreateStoryDto,
    @UploadedFiles() files?: File[],
  ) {
    const userId = req.user.userId;
    // Lấy file đầu tiên nếu có
    const file = files && files.length > 0 ? files[0] : undefined;
    return this.storyService.createStory(createStoryDto, userId, file);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách story của user đang đăng nhập' })
  getStories(@Req() req: any) {
    const ownerId = req.user.userId;
    return this.storyService.getStories(ownerId, ownerId);
  }

  @Get('/me/active')
  @ApiOperation({ summary: 'Lấy danh sách story còn hiệu lực của user đang đăng nhập' })
  getMyActiveStories(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ): Promise<GroupedStoryListDto> {
    const viewerId = req.user.userId;
    return this.storyService.getMyActiveStories(viewerId, Number(page), Number(limit));
  }

  @Get('/me/archive')
  @ApiOperation({ summary: 'Lấy danh sách story đã hết hạn/lưu trữ của user đang đăng nhập' })
  getMyArchivedStories(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<GroupedStoryListDto> {
    const viewerId = req.user.userId;
    return this.storyService.getMyArchivedStories(viewerId, Number(page), Number(limit));
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

  @Get('home')
  @ApiOperation({ summary: 'Lấy danh sách story của bạn bè, gom theo từng user, có phân trang theo user' })
  getAllStoriesHomePage(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<GroupedStoryListDto> {
    const viewerId = req.user.userId;
    return this.storyService.getAllStoriesHomePage(viewerId, Number(page), Number(limit));
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
