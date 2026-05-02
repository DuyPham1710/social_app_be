import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { diskStorage } from '../cloudinary/multer-disk.storage';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReportPostDto } from './dto/report-post.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) { }

  @Get('community-posts/user')
  @ApiOperation({ summary: 'Lấy danh sách bài viết trong cộng đồng của user đang đăng nhập (cả pending và approved)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'pending|approved|all' })
  getUserCommunityPosts(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status: string = 'all',
  ) {
    const userId = req.user.userId;
    return this.postService.getUserCommunityPosts(userId, Number(page), Number(limit), status);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Lấy danh sách bài viết của user' })
  getPostByUserId(
    @Param('id') ownerId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: any,
  ) {
    const viewerId = req.user.userId;
    return this.postService.getAllPostsByUser(ownerId, viewerId, Number(page), Number(limit));
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách bài viết của user đang đăng nhập' })
  getAllPostsByUser(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const ownerId = req.user.userId;
    return this.postService.getAllPostsByUser(ownerId, ownerId, Number(page), Number(limit));
  }

  // lấy các bài viết là bạn của mình, nếu hết rồi thì lấy tiếp bài viết public nếu có
  @Get('home')
  @ApiOperation({ summary: 'Lấy danh sách bài viết là bạn của user đang đăng nhập, nếu hết rồi thì lấy tiếp bài viết public nếu có' })
  getAllPostsHomePage(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const viewerId = req.user.userId;
    return this.postService.getAllPostsHomePage(viewerId, Number(page), Number(limit));
  }

  @Post()
  @ApiOperation({ summary: 'Tạo bài viết' })
  @UseInterceptors(FilesInterceptor('files', 50, { storage: diskStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreatePostDto })
  createPost(
    @Req() req: any,
    @Body() createPostDto: CreatePostDto,
    @UploadedFiles() files?: File[],
  ) {
    const userId = req.user.userId;
    return this.postService.createPost(createPostDto, userId, files);
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật bài viết' })
  updatePost(@Req() req: any, @Body() updatePostDto: UpdatePostDto) {
    const userId = req.user.userId;
    return this.postService.updatePost(updatePostDto, userId);
  }

  @Delete('/:postId')
  @ApiOperation({ summary: 'Xoá bài viết' })
  deletePost(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.userId;
    return this.postService.deletePost(postId, userId);
  }

  @Get('/:postId')
  @ApiOperation({ summary: 'Lấy chi tiết bài viết' })
  getPostDetail(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.userId;
    return this.postService.getPostDetail(postId, userId);
  }

  @Get('/privacy/:postId')
  @ApiOperation({ summary: 'Lấy quyền riêng tư của bài viết' })
  getPostPrivacy(@Param('postId') postId: string) {
    return this.postService.getPostPrivacy(postId);
  }

  @Patch('/privacy/:postId')
  @ApiOperation({ summary: 'Cập nhật quyền riêng tư của bài viết' })
  updatePostPrivacy(@Param('postId') postId: string, @Body() updatePostPrivacyDto: UpdatePrivacyDto) {
    return this.postService.updatePostPrivacy(postId, updatePostPrivacyDto);
  }

  @Post(':postId/report')
  @ApiOperation({ summary: 'Báo cáo bài viết' })
  reportPost(
    @Param('postId') postId: string,
    @Req() req: any,
    @Body() reportPostDto: ReportPostDto,
  ) {
    const userId = req.user.userId;
    return this.postService.reportPost(postId, userId, reportPostDto);
  }

  @Get(':postId/check-privacy')
  @ApiOperation({ summary: 'Kiểm tra quyền riêng tư của bài viết' })
  async checkPrivacy(
    @Param('postId') postId: string,
    @Req() req,
  ) {
    const viewerId = req.user.userId;
    const canView = await this.postService.canUserViewPost(postId, viewerId);

    return { canView };
  }

  @Get(':postId/caption-translation-eligibility')
  @ApiOperation({
    summary: 'Kiểm tra có cần dịch caption không',
  })
  @ApiQuery({
    name: 'targetLang',
    required: false,
    description: 'Mã ngôn ngữ đích (thường là ngôn ngữ máy), mặc định en',
    example: 'vi',
  })
  async getCaptionTranslationEligibility(
    @Param('postId') postId: string,
    @Query('targetLang') targetLang: string = 'en',
  ) {
    return this.postService.getCaptionTranslationEligibility(postId, targetLang || 'en');
  }

  @Post(':postId/translate-caption')
  @ApiOperation({
    summary: 'Dịch caption bài viết (Cloud Translation) theo targetLang (ngôn ngữ máy)',
  })
  @ApiQuery({
    name: 'targetLang',
    required: false,
    description: 'Mã ngôn ngữ đích, mặc định en',
    example: 'vi',
  })
  async translateCaption(
    @Param('postId') postId: string,
    @Query('targetLang') targetLang: string = 'en',
  ) {
    return this.postService.translateCaption(postId, targetLang || 'en');
  }

}
