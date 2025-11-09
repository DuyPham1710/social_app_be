import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { PrivacyResponseDto } from './dto/privacy-response.dto';
import { DefaultPrivacyResponseDto } from './dto/default-privacy-response.dto';
import { UpdateDefaultPrivacyDto } from './dto/update-default-privacy.dto';

@ApiTags('Privacy')
@ApiBearerAuth()
@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) { }

  // @Get()
  // @ApiOperation({ summary: 'Lấy privacy của user đang đăng nhập' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Lấy privacy thành công',
  //   type: PrivacyResponseDto,
  // })
  // @ApiResponse({ status: 400, description: 'Invalid userId' })
  // @ApiResponse({ status: 401, description: 'Unauthorized' })
  // async getPrivacy(@Req() req: { user: { userId: string } }): Promise<PrivacyResponseDto> {
  //   const userId = req.user.userId;
  //   return this.privacyService.getPrivacy(userId);
  // }

  @Get('default')
  @ApiOperation({ summary: 'Lấy defaultPrivacy của user đang đăng nhập' })
  @ApiResponse({
    status: 200,
    description: 'Lấy defaultPrivacy thành công',
    type: DefaultPrivacyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid userId' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDefaultPrivacy(@Req() req: { user: { userId: string } }): Promise<DefaultPrivacyResponseDto> {
    const userId = req.user.userId;
    return this.privacyService.getDefaultPrivacy(userId);
  }

  @Patch('default')
  @ApiOperation({ summary: 'Cập nhật defaultPrivacy của user đang đăng nhập' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật defaultPrivacy thành công',
    type: DefaultPrivacyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid userId, invalid defaultPrivacy, or missing required fields' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateDefaultPrivacy(
    @Req() req: { user: { userId: string } },
    @Body() updateDefaultPrivacyDto: UpdateDefaultPrivacyDto,
  ): Promise<DefaultPrivacyResponseDto> {
    const userId = req.user.userId;
    return this.privacyService.updateDefaultPrivacy(
      userId,
      updateDefaultPrivacyDto.defaultPrivacy,
      updateDefaultPrivacyDto.friends_except,
      updateDefaultPrivacyDto.friends_detail,
    );
  }
}
