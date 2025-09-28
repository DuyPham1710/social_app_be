import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) { }

  @Get('user/:id')
  getPostByUserId(
    @Param('id') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.postService.getAllPostsByUser(userId, Number(page), Number(limit));
  }

  @Get()
  getAllPostsByUser(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const userId = req.user.userId;
    return this.postService.getAllPostsByUser(userId, Number(page), Number(limit));
  }

  @Post()
  createPost(@Req() req: any, @Body() createPostDto: CreatePostDto) {
    const userId = req.user.userId;
    return this.postService.createPost(createPostDto, userId);
  }

  @Patch()
  updatePost(@Req() req: any, @Body() updatePostDto: UpdatePostDto) {
    const userId = req.user.userId;
    return this.postService.updatePost(updatePostDto, userId);
  }

  @Delete('/:postId')
  deletePost(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.userId;
    return this.postService.deletePost(postId, userId);
  }
}
