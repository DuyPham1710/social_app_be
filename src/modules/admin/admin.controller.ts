import { Controller, Delete, Get, Param, Post, Put, Query, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/role.decorator';
import { UserRole } from 'src/shared/enums/user_role';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiBody } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UpdatePostReportStatusDto } from './dto/update-post-report-status.dto';

@ApiBearerAuth()
@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  // ===== User Management =====
  @Get('users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách người dùng (phân trang, tìm kiếm, lọc theo thời gian/status)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Số trang' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng mỗi trang' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo email, username, fullName' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Lọc theo trạng thái active' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Lọc từ ngày tạo tài khoản (ISO date)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Lọc đến ngày tạo tài khoản (ISO date)' })
  getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
    const dateFromDate = dateFrom ? new Date(dateFrom) : undefined;
    const dateToDate = dateTo ? new Date(dateTo) : undefined;
    return this.adminService.getAllUsers(
      Number(page),
      Number(limit),
      search,
      isActiveBool,
      dateFromDate,
      dateToDate
    );
  }

  @Get('users/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết người dùng' })
  getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Post('users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo người dùng mới (chỉ admin)' })
  @ApiBody({ type: CreateUserDto })
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.adminService.createUser(createUserDto);
  }

  @Put('users/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin người dùng (chỉ admin)' })
  @ApiBody({ type: UpdateUserAdminDto })
  updateUser(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserAdminDto,
  ) {
    return this.adminService.updateUser(userId, updateUserDto);
  }

  @Delete('users/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa tài khoản người dùng (soft delete)' })
  deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  @Get('users/:userId/friends')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách bạn bè của người dùng' })
  getUserFriends(@Param('userId') userId: string) {
    return this.adminService.getUserFriends(userId);
  }

  @Get('users/:userId/activity')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy hoạt động gần đây của người dùng' })
  getUserActivity(@Param('userId') userId: string) {
    return this.adminService.getUserActivity(userId);
  }

  // ===== Post Management =====
  @Get('posts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tất cả bài viết (phân trang, tìm kiếm, lọc)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Số trang' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng mỗi trang' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo caption' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Lọc theo userId' })
  getAllPosts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getAllPosts(Number(page), Number(limit), search, userId);
  }

  @Get('posts/:postId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết bài viết' })
  getPostById(@Param('postId') postId: string) {
    return this.adminService.getPostById(postId);
  }

  @Delete('posts/:postId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa bài viết (admin có quyền xóa bất kỳ post nào)' })
  deletePost(@Param('postId') postId: string) {
    return this.adminService.deletePost(postId);
  }

  @Put('posts/:postId/hide')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ẩn bài viết' })
  hidePost(@Param('postId') postId: string) {
    return this.adminService.hidePost(postId);
  }

  @Put('posts/:postId/unhide')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Hiện lại bài viết' })
  unhidePost(@Param('postId') postId: string) {
    return this.adminService.unhidePost(postId);
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

  // ===== Story Management =====
  @Get('stories')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tất cả story (phân trang, lọc theo user/ngày)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Số trang' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng mỗi trang' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Lọc theo userId' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Lọc từ ngày (ISO date)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Lọc đến ngày (ISO date)' })
  getAllStories(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('userId') userId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const dateFromDate = dateFrom ? new Date(dateFrom) : undefined;
    const dateToDate = dateTo ? new Date(dateTo) : undefined;
    return this.adminService.getAllStories(Number(page), Number(limit), userId, dateFromDate, dateToDate);
  }

  @Get('stories/:storyId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết story' })
  getStoryById(@Param('storyId') storyId: string) {
    return this.adminService.getStoryById(storyId);
  }

  @Delete('stories/:storyId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa story (admin có quyền xóa bất kỳ story nào)' })
  deleteStory(@Param('storyId') storyId: string) {
    return this.adminService.deleteStory(storyId);
  }

  @Get('stories/:storyId/reacts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách reacts của story' })
  getStoryReacts(@Param('storyId') storyId: string) {
    return this.adminService.getStoryReacts(storyId);
  }

  // ===== Comment Management =====
  @Get('comments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tất cả bình luận (phân trang, tìm kiếm)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Số trang' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng mỗi trang' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo content' })
  @ApiQuery({ name: 'postId', required: false, type: String, description: 'Lọc theo postId' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Lọc theo userId' })
  getAllComments(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('postId') postId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getAllComments(Number(page), Number(limit), search, postId, userId);
  }

  @Get('comments/:commentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết bình luận' })
  getCommentById(@Param('commentId') commentId: string) {
    return this.adminService.getCommentById(commentId);
  }

  @Delete('comments/:commentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa bình luận (admin có quyền xóa bất kỳ comment nào)' })
  deleteComment(@Param('commentId') commentId: string) {
    return this.adminService.deleteComment(commentId);
  }

  // ===== Post Report Management =====

  @Get('post-reports')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh sách báo cáo bài viết (phân trang, lọc theo status/postId/userId)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'reviewed', 'rejected'],
  })
  @ApiQuery({ name: 'postId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  getPostReports(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: 'pending' | 'reviewed' | 'rejected',
    @Query('postId') postId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getPostReports(
      Number(page),
      Number(limit),
      status,
      postId,
      userId,
    );
  }

  @Get('post-reports/:reportId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết một báo cáo bài viết' })
  getPostReportById(@Param('reportId') reportId: string) {
    return this.adminService.getPostReportById(reportId);
  }

  @Put('post-reports/:reportId/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái xử lý của báo cáo bài viết' })
  @ApiBody({ type: UpdatePostReportStatusDto })
  updatePostReportStatus(
    @Param('reportId') reportId: string,
    @Body() body: UpdatePostReportStatusDto,
  ) {
    return this.adminService.updatePostReportStatus(
      reportId,
      body.status,
      body.note,
    );
  }

  // ===== Dashboard Stats =====
  @Get('dashboard/stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy thống kê tổng quan dashboard' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/users-growth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy biểu đồ tăng trưởng người dùng theo thời gian' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Số ngày muốn lấy (mặc định 30)' })
  getUsersGrowth(@Query('days') days?: number) {
    return this.adminService.getUsersGrowth(days ? Number(days) : 30);
  }

  @Get('dashboard/posts-stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy thống kê bài viết (theo ngày/tháng)' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'month'], description: 'Nhóm theo ngày hoặc tháng' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Số ngày muốn lấy (mặc định 30)' })
  getPostsStats(
    @Query('groupBy') groupBy: 'day' | 'month' = 'day',
    @Query('days') days?: number
  ) {
    return this.adminService.getPostsStats(groupBy, days ? Number(days) : 30);
  }
}
