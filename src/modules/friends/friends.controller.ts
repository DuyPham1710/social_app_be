import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { RemoveFriendDto } from './dto/remove-friend.dto';
import { SearchFriendsDto } from './dto/search-friends.dto';
import { GetMutualFriendsDto } from './dto/get-mutual-friends.dto';
import { FriendSuggestionsDto } from './dto/friend-suggestions.dto';

@ApiTags('Friends')
@ApiBearerAuth()
@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) { }

  @Post('send-request')
  @ApiOperation({ summary: 'Gửi lời mời kết bạn' })
  async sendFriendRequest(@Req() req: any, @Body() sendFriendRequestDto: SendFriendRequestDto) {
    const userId = req.user.userId;
    return await this.friendsService.sendFriendRequest(userId, sendFriendRequestDto);
  }

  @Post('accepted-request')
  @ApiOperation({ summary: 'Phản hồi lời mời kết bạn (chấp nhận)' })
  async acceptedFriendRequest(@Req() req: any, @Body() respondDto: RespondFriendRequestDto) {
    const userId = req.user.userId;
    return await this.friendsService.acceptedFriendRequest(userId, respondDto);
  }

  @Delete(':requestId/rejected-request')
  @ApiOperation({ summary: 'Từ chối lời mời kết bạn' })
  async rejectedFriendRequest(@Req() req: any, @Param('requestId') requestId: string) {
    const userId = req.user.userId;
    return await this.friendsService.rejectedFriendRequest(userId, requestId);
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Xóa bạn bè' })
  async removeFriend(@Req() req: any, @Body() removeFriendDto: RemoveFriendDto) {
    const userId = req.user.userId;
    return await this.friendsService.removeFriend(userId, removeFriendDto);
  }

  @Get('list')
  @ApiOperation({ summary: 'Lấy danh sách bạn bè của người dùng hiện tại' })
  async getFriends(@Req() req: any) {
    const userId = req.user.userId;
    return await this.friendsService.getFriends(userId);
  }

  @Get('list/:targetUserId')
  @ApiOperation({ summary: 'Lấy danh sách bạn bè của 1 user' })
  async getFriendsByUserId(@Req() req: any, @Param('targetUserId') targetUserId: string) {
    const userId = targetUserId;
    return await this.friendsService.getFriends(userId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Tìm kiếm bạn bè theo tên hoặc username' })
  async searchFriends(@Req() req: any, @Query() searchDto: SearchFriendsDto) {
    const userId = req.user.userId;
    return await this.friendsService.searchFriends(userId, searchDto);
  }

  @Get('requests/received')
  @ApiOperation({ summary: 'Lấy danh sách lời mời kết bạn đã nhận' })
  async getReceivedRequests(@Req() req: any) {
    const userId = req.user.userId;
    return await this.friendsService.getReceivedRequests(userId);
  }

  @Get('requests/sent')
  @ApiOperation({ summary: 'Lấy danh sách lời mời kết bạn đã gửi' })
  async getSentRequests(@Req() req: any) {
    const userId = req.user.userId;
    return await this.friendsService.getSentRequests(userId);
  }

  @Delete('requests/:requestId/cancel')
  @ApiOperation({ summary: 'Hủy lời mời kết bạn đã gửi' })
  async cancelFriendRequest(@Req() req: any, @Param('requestId') requestId: string) {
    const userId = req.user.userId;
    return await this.friendsService.cancelFriendRequest(userId, requestId);
  }

  @Get('relationship/:targetUserId')
  @ApiOperation({ summary: 'Kiểm tra trạng thái quan hệ với một user khác' })
  async getRelationshipStatus(@Req() req: any, @Param('targetUserId') targetUserId: string) {
    const userId = req.user.userId;
    return await this.friendsService.getRelationshipStatus(userId, targetUserId);
  }

  @Get('mutual/:targetUserId')
  @ApiOperation({ summary: 'Lấy danh sách bạn chung với một user khác' })
  async getMutualFriends(
    @Req() req: any, 
    @Param('targetUserId') targetUserId: string,
    @Query() query: GetMutualFriendsDto
  ) {
    const userId = req.user.userId;
    return await this.friendsService.getMutualFriends(userId, targetUserId, query.page, query.limit);
  }

  @Get('suggestions')
  @ApiOperation({ 
    summary: 'Gợi ý những người có thể biết để kết bạn',
    description: 'API gợi ý bạn bè dựa trên bạn chung, cùng tuổi, cùng giới tính và các yếu tố khác'
  })
  async getFriendSuggestions(@Req() req: any, @Query() suggestionsDto: FriendSuggestionsDto) {
    const userId = req.user.userId;
    return await this.friendsService.getFriendSuggestions(userId, suggestionsDto);
  }
  @Get(':friendId/activities-summary')
  @ApiOperation({ summary: 'Lấy tóm tắt hoạt động của một người bạn bằng AI' })
  async getFriendActivitiesSummary(
    @Req() req: any,
    @Param('friendId') friendId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('language') language?: string
  ) {
    const userId = req.user.userId;
    return await this.friendsService.getFriendActivitiesSummary(userId, friendId, startDate, endDate, language);
  }
}

