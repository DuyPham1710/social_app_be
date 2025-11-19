import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/role.decorator';
import { UserRole } from 'src/shared/enums/user_role';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  @Get('users/:userId/posts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách bài viết của người dùng' })
  getPostsByUser(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.adminService.getUserPosts(userId, Number(page), Number(limit));
  }

  @Get('users/:userId/stories')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách story của người dùng' })
  getStoriesByUser(
    @Param('userId') userId: string,
  ) {
    return this.adminService.getUserStories(userId);
  }

  @Get('posts/:postId/reacts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách reacts của bài viết' })
  getPostReacts(@Param('postId') postId: string) {
    return this.adminService.getPostReacts(postId);
  }

  @Get('posts/:postId/comments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách bình luận của bài viết' })
  getPostComments(@Param('postId') postId: string) {
    return this.adminService.getPostComments(postId);
  }

  @Get('stories/:storyId/reacts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách reacts của story' })
  getStoryReacts(@Param('storyId') storyId: string) {
    return this.adminService.getStoryReacts(storyId);
  }
}
