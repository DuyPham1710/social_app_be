import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { storage } from '../cloudinary/cloudinary.storage';
import { File } from 'multer';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ApprovePostDto } from './dto/approve-post.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { diskStorage } from '../cloudinary/multer-disk.storage';

@ApiTags('Community')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('community')
export class CommunityController {
    constructor(private readonly communityService: CommunityService) { }

    // ================================================================
    // COMMUNITY CRUD
    // ================================================================

    @Post()
    @ApiOperation({ summary: 'Tạo cộng đồng mới' })
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'avatar', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 }
    ], { storage: diskStorage }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CreateCommunityDto })
    createCommunity(
        @Req() req: any,
        @Body() dto: CreateCommunityDto,
        @UploadedFiles() files?: { avatar?: File[], coverImage?: File[] } // Nhận 2 file tương ứng
    ) {
        const avatarFile = files?.avatar ? files.avatar[0] : undefined;
        const coverImageFile = files?.coverImage ? files.coverImage[0] : undefined;
        return this.communityService.createCommunity(req.user.userId, dto, avatarFile, coverImageFile);
    }

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách tất cả cộng đồng' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'search', required: false })
    getAllCommunities(
        @Req() req: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('search') search?: string,
    ) {
        return this.communityService.getAllCommunities(Number(page), Number(limit), search, req.user.userId);
    }

    @Get('me')
    @ApiOperation({ summary: 'Lấy danh sách cộng đồng của tôi' })
    getMyCommunities(@Req() req: any) {
        return this.communityService.getMyCommunities(req.user.userId);
    }

    @Get('invites')
    @ApiOperation({ summary: 'Lấy danh sách lời mời tham gia cộng đồng' })
    getMyInvites(@Req() req: any) {
        return this.communityService.getMyInvites(req.user.userId);
    }

    @Get(':communityId')
    @ApiOperation({ summary: 'Xem chi tiết cộng đồng' })
    getCommunity(@Param('communityId') communityId: string) {
        return this.communityService.getCommunity(communityId);
    }

    @Patch(':communityId')
    @ApiOperation({ summary: 'Cập nhật thông tin cộng đồng (chỉ admin)' })
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'avatar', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 }
    ], { storage: diskStorage }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UpdateCommunityDto })
    updateCommunity(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Body() dto: UpdateCommunityDto,
        @UploadedFiles() files?: { avatar?: File[], coverImage?: File[] }
    ) {
        const avatarFile = files?.avatar ? files.avatar[0] : undefined;
        const coverImageFile = files?.coverImage ? files.coverImage[0] : undefined;
        return this.communityService.updateCommunity(communityId, req.user.userId, dto, avatarFile, coverImageFile);
    }

    @Delete(':communityId')
    @ApiOperation({ summary: 'Xóa cộng đồng (chỉ admin)' })
    deleteCommunity(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.deleteCommunity(communityId, req.user.userId);
    }

    // ================================================================
    // MEMBER MANAGEMENT
    // ================================================================

    @Get(':communityId/members')
    @ApiOperation({ summary: 'Lấy danh sách thành viên của cộng đồng' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    getMembers(
        @Param('communityId') communityId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        return this.communityService.getMembers(communityId, Number(page), Number(limit));
    }

    @Get(':communityId/members/status')
    @ApiOperation({ summary: 'Kiểm tra trạng thái tham gia của tôi trong cộng đồng' })
    getMemberStatus(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.getMemberStatus(req.user.userId, communityId);
    }

    @Get(':communityId/available-friends')
    @ApiOperation({ summary: 'Lấy danh sách bạn bè chưa tham gia cộng đồng' })
    getAvailableFriends(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.getAvailableFriends(req.user.userId, communityId);
    }

    @Post(':communityId/join')
    @ApiOperation({ summary: 'Gửi yêu cầu tham gia cộng đồng' })
    requestJoin(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.requestJoin(req.user.userId, communityId);
    }

    @Delete(':communityId/join')
    @ApiOperation({ summary: 'Hủy yêu cầu tham gia cộng đồng' })
    cancelJoinRequest(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.cancelJoinRequest(req.user.userId, communityId);
    }

    @Delete(':communityId/leave')
    @ApiOperation({ summary: 'Rời khỏi cộng đồng' })
    leaveGroup(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.leaveGroup(req.user.userId, communityId);
    }

    @Post(':communityId/invite')
    @ApiOperation({ summary: 'Admin mời thành viên vào cộng đồng' })
    inviteMember(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Body() dto: InviteMemberDto,
    ) {
        return this.communityService.inviteMember(req.user.userId, communityId, dto);
    }

    @Post(':communityId/invite-friend')
    @ApiOperation({ summary: 'Thành viên mời bạn bè tham gia cộng đồng' })
    inviteFriend(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Body() dto: InviteMemberDto,
    ) {
        return this.communityService.inviteFriend(req.user.userId, communityId, dto.userId);
    }

    // ================================================================
    // REQUESTS MANAGEMENT
    // ================================================================

    @Get(':communityId/requests')
    @ApiOperation({ summary: 'Admin xem danh sách yêu cầu tham gia đang chờ duyệt' })
    getPendingRequests(@Req() req: any, @Param('communityId') communityId: string) {
        return this.communityService.getPendingRequests(req.user.userId, communityId);
    }

    @Patch(':communityId/requests/:requestId')
    @ApiOperation({ summary: 'Admin duyệt / từ chối yêu cầu tham gia' })
    respondJoinRequest(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('requestId') requestId: string,
        @Body() dto: RespondRequestDto,
    ) {
        return this.communityService.respondJoinRequest(req.user.userId, communityId, requestId, dto);
    }

    @Patch(':communityId/invites/:requestId')
    @ApiOperation({ summary: 'User chấp nhận / từ chối lời mời tham gia' })
    respondInvite(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('requestId') requestId: string,
        @Body() dto: RespondRequestDto,
    ) {
        return this.communityService.respondInvite(req.user.userId, communityId, requestId, dto);
    }

    @Delete(':communityId/members/:memberId')
    @ApiOperation({ summary: 'Admin xóa thành viên khỏi cộng đồng (kick)' })
    kickMember(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('memberId') memberId: string,
    ) {
        return this.communityService.kickMember(req.user.userId, communityId, memberId);
    }

    @Patch(':communityId/members/:memberId/promote')
    @ApiOperation({ summary: 'Admin nâng quyền thành viên lên admin' })
    promoteToAdmin(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('memberId') memberId: string,
    ) {
        return this.communityService.promoteToAdmin(req.user.userId, communityId, memberId);
    }

    @Patch(':communityId/members/:memberId/demote')
    @ApiOperation({ summary: 'Admin hạ quyền admin xuống thành viên' })
    demoteAdmin(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('memberId') memberId: string,
    ) {
        return this.communityService.demoteAdmin(req.user.userId, communityId, memberId);
    }

    // ================================================================
    // COMMUNITY POSTS
    // ================================================================

    @Get(':communityId/posts')
    @ApiOperation({ summary: 'Lấy danh sách bài viết đã được duyệt trong cộng đồng' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    getCommunityPosts(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.communityService.getCommunityPosts(communityId, req.user.userId, Number(page), Number(limit));
    }

    @Get(':communityId/posts/pending')
    @ApiOperation({ summary: 'Admin xem bài viết chờ duyệt trong cộng đồng' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    getPendingPosts(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.communityService.getPendingPosts(req.user.userId, communityId, Number(page), Number(limit));
    }

    @Patch(':communityId/posts/:postId/approve')
    @ApiOperation({ summary: 'Duyệt hoặc từ chối bài viết (chỉ admin)' })
    approvePost(
        @Req() req: any,
        @Param('communityId') communityId: string,
        @Param('postId') postId: string,
        @Body() dto: ApprovePostDto,
    ) {
        return this.communityService.approvePost(req.user.userId, communityId, postId, dto);
    }

    // ================================================================
    // COMMUNITY ROADMAP
    // ================================================================

    @Get(':communityId/roadmap')
    @ApiOperation({ summary: 'Lấy danh sách các điểm trên roadmap của cộng đồng' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    getRoadmapPoints(
        @Param('communityId') communityId: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        return this.communityService.getRoadmapPoints(communityId, Number(page), Number(limit));
    }

    @Get(':communityId/roadmap/nearby')
    @ApiOperation({ summary: 'Lấy các điểm roadmap gần vị trí user' })
    @ApiQuery({ name: 'lat', required: true })
    @ApiQuery({ name: 'lng', required: true })
    @ApiQuery({ name: 'radius', required: false, description: 'Bán kính tìm kiếm (km), mặc định 5km' })
    getNearbyRoadmapPoints(
        @Param('communityId') communityId: string,
        @Query('lat') lat: number,
        @Query('lng') lng: number,
        @Query('radius') radius: number = 5,
    ) {
        return this.communityService.getNearbyRoadmapPoints(communityId, Number(lat), Number(lng), Number(radius));
    }

    @Get(':communityId/roadmap/:roadmapId/posts')
    @ApiOperation({ summary: 'Lấy các bài viết của một điểm roadmap' })
    getRoadmapPointPosts(
        @Param('communityId') communityId: string,
        @Param('roadmapId') roadmapId: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
        @Req() req: any,
    ) {
        const userId = req.user.userId;
        return this.communityService.getRoadmapPointPosts(communityId, roadmapId, Number(page), Number(limit), userId);
    }
}
