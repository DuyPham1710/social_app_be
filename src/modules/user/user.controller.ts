import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserService } from './user.service';
import UserResponseDto from './dto/user.response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import UpdateUserDto from './dto/update.user.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { storage } from '../cloudinary/cloudinary.storage';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/shared/enums/user_role';
import { Roles } from 'src/common/decorators/role.decorator';
import { File } from 'multer';
import { FaceRecognitionService } from 'src/shared/services/face-recognition.service';

@ApiBearerAuth()
@Controller('user')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly faceRecognitionService: FaceRecognitionService,
  ) { }

  @Get()
  @Roles(UserRole.ADMIN)
  getAll(): Promise<UserResponseDto[]> {
    return this.userService.findAll();
  }

  @Get('profile')
  @ApiOperation({ summary: 'Lấy thông tin người dùng đang đăng nhập' })
  profile(@Req() req: any): Promise<UserResponseDto> {
    const userId: string = req.user?.userId?.toString?.() ?? req.user?.userId;
    return this.userService.findOne(userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Tìm kiếm người dùng theo tên hoặc username' })
  searchUser(
    @Req() req: any,
    @Query('query') query: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('saveToHistory') saveToHistory: string = 'true'
  ) {
    const userId = req.user.userId;
    const shouldSaveToHistory = saveToHistory === 'true' || saveToHistory === '1';
    return this.userService.searchUser(query, Number(page), Number(limit), userId, shouldSaveToHistory);
  }

  @Get('search/history')
  @ApiOperation({ summary: 'Lấy lịch sử tìm kiếm của người dùng' })
  async getSearchHistory(
    @Req() req: any,
    @Query('limit') limit: number = 10
  ) {
    const userId = req.user.userId;
    return this.userService.getSearchHistory(userId, Number(limit));
  }

  @Get('search/history/viewed/:viewedUserId')
  @ApiOperation({ summary: 'Lưu người dùng đã xem vào lịch sử tìm kiếm' })
  async saveViewedUser(
    @Req() req: any,
    @Param('viewedUserId') viewedUserId: string
  ) {
    const userId = req.user.userId;
    await this.userService.saveViewedUser(userId, viewedUserId);
    return { message: 'Viewed user saved to search history successfully' };
  }

  @Delete('search/history/clear')
  @ApiOperation({ summary: 'Xóa tất cả lịch sử tìm kiếm của người dùng' })
  async clearSearchHistory(@Req() req: any) {
    const userId = req.user.userId;
    await this.userService.deleteSearchHistory(userId);
    return { message: 'All search history cleared successfully' };
  }

  @Delete('search/history/:id')
  @ApiOperation({ summary: 'Xóa một lịch sử tìm kiếm cụ thể' })
  async deleteSearchHistory(
    @Req() req: any,
    @Param('id') id: string
  ) {
    const userId = req.user.userId;
    await this.userService.deleteSearchHistory(userId, id);
    return { message: 'Search history deleted successfully' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin người dùng theo ID' })
  getById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.findOne(id);
  }

  @Patch()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },  // Avatar
    { name: 'cover', maxCount: 1 }  // Ảnh bìa mới
  ], { storage })) // Vẫn dùng storage cloudinary cũ
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Nguyen Van A' },
        phoneNumber: { type: 'string', example: '0909090909' },
        dateOfBirth: { type: 'string', example: '2000-01-01' },
        gender: { type: 'string', example: 'male' },
        bio: { type: 'string', example: 'This is my bio.' },
        school: { type: 'string', example: 'UTE' },
        currentCity: { type: 'string', example: 'Ho Chi Minh City' },
        hometown: { type: 'string', example: 'Ha Noi' },
        workplace: { type: 'string', example: 'Google' },
        relationshipStatus: { type: 'string', example: 'Độc thân' },

        file: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image'
        },
        cover: {
          type: 'string',
          format: 'binary',
          description: 'Cover image (Ảnh bìa)'
        },
      },
    },
  })
  // editProfile(
  //   @Req() req: any,
  //   @Body() updateUserDto: UpdateUserDto,
  //   @UploadedFiles() files: { file?: File, cover?: File}
  // ): Promise<UserResponseDto> {

  //   if (files?.file && files.file.path) {
  //     updateUserDto.avatarUrl = files.file.path;
  //   }

  //   if (files?.cover && files.cover.path) {
  //     updateUserDto.coverUrl = files.cover.path;
  //   }

  //   return this.userService.update(req.user.userId.toString(), updateUserDto);
  // }
  editProfile(
    @Req() req: any,
    @Body() updateUserDto: UpdateUserDto,
    // Sửa type của files thành mảng file
    @UploadedFiles() files: { file?: File[], cover?: File[] }
  ): Promise<UserResponseDto> {

    if (files?.file && files.file.length > 0) {
      updateUserDto.avatarUrl = files.file[0].path;
    }

    if (files?.cover && files.cover.length > 0) {
      updateUserDto.coverUrl = files.cover[0].path;
    }

    return this.userService.update(req.user.userId.toString(), updateUserDto);
  }

  @Public()
  @Put()
  @ApiBody({ type: UpdateUserDto })
  updatePersonalInfo(@Body() updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    updateUserDto.avatarUrl = '';
    updateUserDto.coverUrl = '';
    return this.userService.update(updateUserDto._id ?? '', updateUserDto);
  }

  @Post('fcm-token')
  @ApiOperation({ summary: 'Cập nhật FCM token cho push notification' })
  @ApiBody({ type: UpdateFcmTokenDto })
  async updateFcmToken(
    @Req() req: any,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto
  ): Promise<{ message: string }> {
    const userId = req.user.userId;
    await this.userService.updateFcmToken(userId, updateFcmTokenDto.fcmToken);
    return { message: 'FCM token updated successfully' };
  }

  @Public()
  @Post('face-registration')
  @ApiOperation({ summary: 'Đăng ký khuôn mặt (5 góc) khi tạo tài khoản hoặc quét lại sau' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'images'],
      properties: {
        userId: { type: 'string', description: 'ID của user đăng ký mặt' },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '5 ảnh base64 theo thứ tự: center, up, down, left, right',
        },
      },
    },
  })
  async registerFace(
    @Body() body: { userId: string; images: string[] },
  ) {
    const result = await this.faceRecognitionService.registerFace(body.userId, body.images);
    if (result.success) {
      await this.userService.updateFaceRegistrationStatus(body.userId, true);
    }
    return result;
  }
}
