import { Body, Controller, Get, Patch, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserService } from './user.service';
import UserResponseDto from './dto/user.response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import UpdateUserDto from './dto/update.user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { storage } from '../cloudinary/cloudinary.storage';
import { File } from 'multer';
import { Public } from 'src/common/decorators/public.decorator';

@ApiBearerAuth()
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get()
  getAll(): Promise<UserResponseDto[]> {
    return this.userService.findAll();
  }

  @Get('profile')
  profile(@Req() req: any) {
    return req.user;
  }

  @Patch()
  @UseInterceptors(FileInterceptor('file', { storage }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Nguyen Van A' },
        phoneNumber: { type: 'string', example: '0909090909' },
        dateOfBirth: { type: 'string', example: '2000-01-01' },
        gender: { type: 'string', example: 'male' },
        // email: { type: 'string', example: 'abc@gmail.com' },
        // username: { type: 'string', example: 'username123' },
        // password: { type: 'string', example: 'mypassword' },
        bio: { type: 'string', example: 'This is my bio.' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  editProfile(
    @Req() req: any,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file: File): Promise<UserResponseDto> {
    if (file && file.path) {
      updateUserDto.avatarUrl = file.path;
    }
    return this.userService.update(req.user.userId.toString(), updateUserDto);
  }

  @Public()
  @Put()
  @ApiBody({ type: UpdateUserDto })
  updatePersonalInfo(@Body() updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    updateUserDto.avatarUrl = '';
    return this.userService.update(updateUserDto.userId!, updateUserDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Tìm kiếm người dùng theo tên hoặc username' })
  searchUser(
    @Req() req: any,
    @Query('query') query: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    const userId = req.user.userId;
    return this.userService.searchUser(query, Number(page), Number(limit), userId);
  }
}
