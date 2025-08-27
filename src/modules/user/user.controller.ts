import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import UserResponseDto from './dto/user.response.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

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
}
