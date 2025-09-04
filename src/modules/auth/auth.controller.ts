import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import RegisterUserDto from '../user/dto/register.user.dto';
import UserResponseDto from '../user/dto/user.response.dto';
import { ApiBody } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from 'src/common/guards/local-auth.guard';
import { VerifyAccountDto } from './dto/verify.account';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() createUserDto: RegisterUserDto): Promise<UserResponseDto> {
    return this.authService.register(createUserDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiBody({ type: LoginDto })
  login(@Req() userLoginRequest: any) {
    return this.authService.login(userLoginRequest.user);
  }

  @Patch('verify-account')
  verifyAccount(@Body() verifyAccountDto: VerifyAccountDto) {
    return this.authService.verifyAccount(verifyAccountDto);
  }
}
