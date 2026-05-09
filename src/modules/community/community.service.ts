import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { Community, CommunityDocument } from './schemas/community.schema';
import { CommunityMember, CommunityMemberDocument } from './schemas/community_member.schema';
import { CommunityRequest, CommunityRequestDocument } from './schemas/community_request.schema';

import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ApprovePostDto, PostAction } from './dto/approve-post.dto';
import { RespondRequestDto, RequestAction } from './dto/respond-request.dto';

import { AppEvents } from 'src/shared/enums/app-events.enum';
import { NotificationType } from 'src/shared/enums/notification_type';
import { CommunityPrivacy } from 'src/shared/enums/community_privacy';
import { CommunityPostStatus } from '../post/schemas/post.schema';

import { File } from 'multer';
import { ImageModerationService } from 'src/shared/services/image-moderation.service';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';

@Injectable()
export class CommunityService {
    private readonly logger = new Logger(CommunityService.name);

    constructor(
        @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
        @InjectModel(CommunityMember.name) private memberModel: Model<CommunityMemberDocument>,
        @InjectModel(CommunityRequest.name) private requestModel: Model<CommunityRequestDocument>,
        private readonly imageModerationService: ImageModerationService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    // ================================================================
    // COMMUNITY CRUD
    // ================================================================

    async createCommunity(userId: string, dto: CreateCommunityDto, avatarFile?: File, coverImageFile?: File) {
        // Kiểm duyệt hình ảnh bằng AI trước khi upload
        await this.moderateImage(avatarFile);
        await this.moderateImage(coverImageFile);

        const [avatarUrl, coverImageUrl] = await Promise.all([
            avatarFile ? this.uploadCommunityImageToCloudinary(avatarFile, userId, 'avatar') : Promise.resolve(undefined),
            coverImageFile ? this.uploadCommunityImageToCloudinary(coverImageFile, userId, 'coverImage') : Promise.resolve(undefined),
        ]);

        const communityPayload: any = {
            ...dto,
            adminId: new Types.ObjectId(userId),
        };

        if (avatarUrl) {
            communityPayload.avatar = avatarUrl;
        }
        if (coverImageUrl) {
            communityPayload.coverImage = coverImageUrl;
        }

        const community = await this.communityModel.create(communityPayload);

        // Creator tự động trở thành member với role admin
        await this.memberModel.create({
            userId: new Types.ObjectId(userId),
            communityId: community._id,
            role: 'admin',
        });

        await this.communityModel.findByIdAndUpdate(community._id, { $inc: { memberCount: 1 } });

        return community;
    }

    // Kiểm tra vi phạm tiêu chuẩn cộng đồng trước khi upload, nếu vi phạm sẽ xóa file tạm và trả về lỗi
    private async moderateImage(file: File): Promise<void> {
        if (file && file.mimetype?.startsWith('image/')) {
            const moderationResults = await this.imageModerationService.checkImages([file]);
            const violatedImage = moderationResults.find(r => !r.is_safe);

            if (violatedImage) {
                this.cleanupTempFile(file);
                throw new BadRequestException(
                    `Hình ảnh vi phạm tiêu chuẩn cộng đồng! Vui lòng chọn hình ảnh khác.`,
                );
            }
        }
    }

    // Xóa file tạm trên disk sau khi xử lý xong
    private cleanupTempFile(file: File): void {
        try {
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                this.logger.debug(`Đã xóa file tạm: ${file.path}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Không thể xóa file tạm ${file.path}: ${message}`);
        }
    }

    async getCommunity(communityId: string) {
        if (!Types.ObjectId.isValid(communityId)) {
            throw new BadRequestException('communityId không hợp lệ');
        }

        const community = await this.communityModel
            .findById(communityId)
            .populate('adminId', 'fullName username avatarUrl')
            .lean();

        if (!community) throw new NotFoundException('Không tìm thấy cộng đồng');
        return community;
    }

    async getAllCommunities(page: number = 1, limit: number = 10, search?: string, userId?: string) {
        const skip = (page - 1) * limit;
        const query: any = {};

        if (search && search.trim()) {
            query.name = { $regex: search.trim(), $options: 'i' };
        }

        const [communities, total] = await Promise.all([
            this.communityModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('adminId', 'fullName username avatarUrl')
                .lean(),
            this.communityModel.countDocuments(query),
        ]);

        // Thêm memberStatus cho từng community nếu có userId
        let result = communities;
        if (userId) {
            result = await Promise.all(
                communities.map(async (c: any) => {
                    const member = await this.memberModel.findOne({
                        userId: new Types.ObjectId(userId),
                        communityId: new Types.ObjectId(c._id),
                    });
                    const pendingRequest = await this.requestModel.findOne({
                        userId: new Types.ObjectId(userId),
                        communityId: new Types.ObjectId(c._id),
                        type: 'join',
                        status: 'pending',
                    });
                    return {
                        ...c,
                        memberStatus: member ? 'member' : (pendingRequest ? 'pending' : null),
                        myRole: member?.role ?? null,
                    };
                }),
            );
        }

        return {
            data: result,
            page,
            limit,
            total,
            hasNext: skip + communities.length < total,
        };
    }

    async getMyCommunities(userId: string) {
        const members = await this.memberModel
            .find({ userId: new Types.ObjectId(userId) })
            .select('communityId role')
            .lean();

        const communityIds = members.map((m) => m.communityId);

        const communities = await this.communityModel
            .find({ _id: { $in: communityIds } })
            .populate('adminId', 'fullName username avatarUrl')
            .lean();

        // Gán thêm role và memberStatus của user trong từng community
        const roleMap = new Map(members.map((m) => [m.communityId.toString(), m.role]));
        return communities.map((c: any) => ({
            ...c,
            memberStatus: 'member',
            myRole: roleMap.get(c._id.toString()) ?? 'member',
        }));
    }

    async updateCommunity(communityId: string, userId: string, dto: UpdateCommunityDto, avatarFile?: File, coverImageFile?: File) {
        // Kiểm duyệt hình ảnh bằng AI trước khi upload
        await this.moderateImage(avatarFile);
        await this.moderateImage(coverImageFile);

        const [avatarUrl, coverImageUrl] = await Promise.all([
            avatarFile ? this.uploadCommunityImageToCloudinary(avatarFile, userId, 'avatar') : Promise.resolve(undefined),
            coverImageFile ? this.uploadCommunityImageToCloudinary(coverImageFile, userId, 'coverImage') : Promise.resolve(undefined),
        ]);

        const updatePayload: any = {};

        if (dto.name !== undefined) {
            const normalizedName = dto.name.trim();
            if (normalizedName) {
                updatePayload.name = normalizedName;
            }
        }

        if (dto.description !== undefined) {
            updatePayload.description = dto.description;
        }

        if (dto.privacy !== undefined) {
            updatePayload.privacy = dto.privacy;
        }

        if (avatarUrl) {
            updatePayload.avatar = avatarUrl;
        }
        if (coverImageUrl) {
            updatePayload.coverImage = coverImageUrl;
        }


        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, userId);

        Object.assign(community, updatePayload);
        return community.save();
    }

    private async uploadCommunityImageToCloudinary(file: File, userId: string, fieldName: 'avatar' | 'coverImage'): Promise<string | undefined> {
        if (!file.path) {
            return undefined;
        }

        try {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: `communities/${userId}/${fieldName}`,
                resource_type: 'image',
                allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
                transformation: [{ width: 1080, height: 1080, crop: 'limit' }],
            });

            return result.secure_url;
        } finally {
            this.cleanupTempFile(file);
        }
    }

    async deleteCommunity(communityId: string, userId: string) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, userId);

        await Promise.all([
            this.memberModel.deleteMany({ communityId: community._id }),
            this.requestModel.deleteMany({ communityId: community._id }),
            community.deleteOne(),
        ]);

        return { message: 'Đã xóa cộng đồng thành công' };
    }

    // ================================================================
    // MEMBER MANAGEMENT
    // ================================================================

    async requestJoin(userId: string, communityId: string) {
        const community = await this.findCommunityOrFail(communityId);
        const userIdObj = new Types.ObjectId(userId);

        // Kiểm tra đã là thành viên chưa
        const existing = await this.memberModel.findOne({
            userId: userIdObj,
            communityId: community._id,
        });
        if (existing) throw new BadRequestException('Bạn đã là thành viên của cộng đồng này');

        // Kiểm tra đã gửi yêu cầu chưa
        const existingReq = await this.requestModel.findOne({
            userId: userIdObj,
            communityId: community._id,
            type: 'join',
            status: 'pending',
        });
        if (existingReq) throw new BadRequestException('Bạn đã gửi yêu cầu tham gia rồi');

        // PUBLIC: Tự động thêm thành viên, không cần duyệt
        if (community.privacy === CommunityPrivacy.PUBLIC) {
            await this.memberModel.create({
                userId: userIdObj,
                communityId: community._id,
                role: 'member',
            });

            await this.communityModel.findByIdAndUpdate(community._id, { $inc: { memberCount: 1 } });

            // Thông báo cho admin khi user tham gia PUBLIC community
            this.eventEmitter.emit('community.auto.join', {
                receiver: community.adminId.toString(),
                sender: userId,
                communityId: communityId,
                communityName: community.name,
            });

            return { message: `Đã tham gia cộng đồng "${community.name}" thành công` };
        }

        // PRIVATE: Tạo yêu cầu chờ duyệt
        const joinRequest = await this.requestModel.create({
            userId: userIdObj,
            communityId: community._id,
            type: 'join',
            status: 'pending',
            senderId: null,
        });

        // Thông báo cho admin
        this.eventEmitter.emit('community.join.request', {
            receiver: community.adminId.toString(),
            sender: userId,
            communityId: communityId,
            communityName: community.name,
            requestId: (joinRequest._id as Types.ObjectId).toString(),
        });

        return { message: 'Đã gửi yêu cầu tham gia cộng đồng', requestId: (joinRequest._id as Types.ObjectId).toString() };
    }

    async cancelJoinRequest(userId: string, communityId: string) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');

        const req = await this.requestModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
            type: 'join',
            status: 'pending',
        });

        if (!req) throw new NotFoundException('Không tìm thấy yêu cầu tham gia');

        await req.deleteOne();
        return { message: 'Đã hủy yêu cầu tham gia' };
    }

    async inviteMember(adminId: string, communityId: string, dto: InviteMemberDto) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        const targetUserId = dto.userId;

        // Kiểm tra user tồn tại
        const [userExists] = await this.eventEmitter.emitAsync(AppEvents.USER_CHECK_EXISTS, { userId: targetUserId });
        if (!userExists) throw new NotFoundException('Không tìm thấy người dùng');

        // Kiểm tra đã là thành viên chưa
        const existing = await this.memberModel.findOne({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
        });
        if (existing) throw new BadRequestException('Người này đã là thành viên');

        // Kiểm tra đã có invite pending chưa
        const existingInvite = await this.requestModel.findOne({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
            type: 'invite',
            status: 'pending',
        });
        if (existingInvite) throw new BadRequestException('Đã gửi lời mời cho người này rồi');

        const invite = await this.requestModel.create({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
            type: 'invite',
            status: 'pending',
            senderId: new Types.ObjectId(adminId),
        });

        // Thông báo cho người được mời
        this.eventEmitter.emit('community.invite', {
            receiver: targetUserId,
            sender: adminId,
            communityId: communityId,
            communityName: community.name,
        });

        return { message: 'Đã gửi lời mời thành công', inviteId: (invite._id as Types.ObjectId).toString() };
    }

    async respondJoinRequest(adminId: string, communityId: string, requestId: string, dto: RespondRequestDto) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        const joinRequest = await this.requestModel.findOne({
            _id: new Types.ObjectId(requestId),
            communityId: community._id,
            type: 'join',
            status: 'pending',
        });
        if (!joinRequest) throw new NotFoundException('Không tìm thấy yêu cầu tham gia');

        if (dto.action === RequestAction.APPROVE) {
            // Thêm vào danh sách thành viên
            await this.memberModel.create({
                userId: joinRequest.userId,
                communityId: community._id,
                role: 'member',
            });

            await this.communityModel.findByIdAndUpdate(community._id, { $inc: { memberCount: 1 } });

            // Xóa request sau khi duyệt
            await joinRequest.deleteOne();

            // Thông báo cho user được duyệt
            this.eventEmitter.emit('community.join.approved', {
                receiver: joinRequest.userId.toString(),
                sender: adminId,
                communityId: communityId,
                communityName: community.name,
            });

            return { message: 'Đã chấp nhận yêu cầu tham gia' };
        } else {
            // Xóa request khi từ chối
            await joinRequest.deleteOne();

            // Thông báo từ chối
            this.eventEmitter.emit('community.join.rejected', {
                receiver: joinRequest.userId.toString(),
                sender: adminId,
                communityId: communityId,
                communityName: community.name,
            });

            return { message: 'Đã từ chối yêu cầu tham gia' };
        }
    }

    async respondInvite(userId: string, communityId: string, requestId: string, dto: RespondRequestDto) {
        if (!Types.ObjectId.isValid(communityId) || !Types.ObjectId.isValid(requestId)) {
            throw new BadRequestException('ID không hợp lệ');
        }

        const invite = await this.requestModel.findOne({
            _id: new Types.ObjectId(requestId),
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
            type: 'invite',
            status: 'pending',
        });
        if (!invite) throw new NotFoundException('Không tìm thấy lời mời');

        if (dto.action === RequestAction.APPROVE) {
            // Kiểm tra đã là thành viên chưa (đề phòng)
            const existing = await this.memberModel.findOne({
                userId: new Types.ObjectId(userId),
                communityId: new Types.ObjectId(communityId),
            });

            if (!existing) {
                const community = await this.findCommunityOrFail(communityId);
                const inviterIsAdmin = await this.memberModel.findOne({
                    userId: invite.senderId,
                    communityId: community._id,
                    role: 'admin',
                });
                // kiểm tra nếu cộng đông public hoặc người gửi invite là admin thì tự động thêm thành viên, ngược lại tạo yêu cầu join chờ admin duyệt
                if (community.privacy === CommunityPrivacy.PUBLIC || inviterIsAdmin) {

                    await this.memberModel.create({
                        userId: new Types.ObjectId(userId),
                        communityId: new Types.ObjectId(communityId),
                        role: 'member',
                    });
                    await this.communityModel.findByIdAndUpdate(communityId, { $inc: { memberCount: 1 } });
                }
                else {
                    try {
                        await this.requestJoin(userId, communityId);
                    } catch (error) {
                        await invite.deleteOne();
                        throw new BadRequestException('Gặp lỗi khi chấp nhận lời mời');
                    }
                }
            }

            // Xóa invite sau khi chấp nhận
            await invite.deleteOne();

            return { message: `Đã tham gia cộng đồng` };
        } else {
            // Xóa invite khi từ chối
            await invite.deleteOne();
            return { message: 'Đã từ chối lời mời' };
        }
    }

    async leaveGroup(userId: string, communityId: string) {
        const community = await this.findCommunityOrFail(communityId);

        if (community.adminId.toString() === userId) {
            throw new BadRequestException('Admin không thể rời nhóm. Hãy chuyển quyền admin trước hoặc xóa nhóm');
        }

        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: community._id,
        });
        if (!member) throw new NotFoundException('Bạn không phải thành viên của cộng đồng này');

        // Xóa member
        await member.deleteOne();
        // Xóa luôn join request pending của user
        await this.requestModel.deleteMany({
            userId: new Types.ObjectId(userId),
            communityId: community._id,
            type: 'join',
        });
        await this.communityModel.findByIdAndUpdate(community._id, { $inc: { memberCount: -1 } });

        return { message: 'Đã rời khỏi cộng đồng' };
    }

    async kickMember(adminId: string, communityId: string, memberId: string) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        if (memberId === adminId) throw new BadRequestException('Không thể tự kick chính mình');

        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(memberId),
            communityId: community._id,
        });
        if (!member) throw new NotFoundException('Thành viên không tồn tại trong cộng đồng');

        await member.deleteOne();
        await this.communityModel.findByIdAndUpdate(community._id, { $inc: { memberCount: -1 } });

        return { message: 'Đã xóa thành viên khỏi cộng đồng' };
    }

    async promoteToAdmin(adminId: string, communityId: string, memberId: string) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(memberId),
            communityId: community._id,
        });
        if (!member) throw new NotFoundException('Thành viên không tồn tại trong cộng đồng');

        member.role = 'admin';
        await member.save();

        return { message: 'Đã nâng quyền thành admin' };
    }

    async demoteAdmin(adminId: string, communityId: string, memberId: string) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        if (community.adminId.toString() === memberId) {
            throw new BadRequestException('Không thể hạ quyền admin chủ cộng đồng');
        }

        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(memberId),
            communityId: community._id,
        });
        if (!member) throw new NotFoundException('Thành viên không tồn tại');

        member.role = 'member';
        await member.save();
        return { message: 'Đã hạ quyền về thành viên' };
    }

    async getMembers(communityId: string, page: number = 1, limit: number = 20) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');
        const skip = (page - 1) * limit;

        const [members, total] = await Promise.all([
            this.memberModel
                .find({ communityId: new Types.ObjectId(communityId) })
                .populate('userId', 'fullName username avatarUrl')
                .sort({ createdAt: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.memberModel.countDocuments({ communityId: new Types.ObjectId(communityId) }),
        ]);

        return {
            data: members,
            page,
            limit,
            total,
            hasNext: skip + members.length < total,
        };
    }

    async getPendingRequests(adminId: string, communityId: string) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        return this.requestModel
            .find({
                communityId: community._id,
                type: 'join',
                status: 'pending',
            })
            .populate('userId', 'fullName username avatarUrl')
            .sort({ createdAt: -1 })
            .lean();
    }

    async getMyInvites(userId: string) {
        return this.requestModel
            .find({
                userId: new Types.ObjectId(userId),
                type: 'invite',
                status: 'pending',
            })
            .populate('communityId', 'name avatar description')
            .sort({ createdAt: -1 })
            .lean();
    }

    async getMemberStatus(userId: string, communityId: string) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');

        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
        });

        if (member) {
            return { status: 'member', role: member.role };
        }

        const pendingRequest = await this.requestModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
            type: 'join',
            status: 'pending',
        });

        if (pendingRequest) {
            return { status: 'pending', requestId: pendingRequest._id };
        }

        return { status: 'none' };
    }

    async getAvailableFriends(userId: string, communityId: string) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');

        // Kiểm tra user là thành viên cộng đồng
        const isMember = await this.memberModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
        });
        if (!isMember) throw new ForbiddenException('Bạn không phải là thành viên cộng đồng');

        // Lấy danh sách bạn bè của user
        const [friendList] = await this.eventEmitter.emitAsync(AppEvents.GET_FRIENDS, { userId });
        if (!friendList || !Array.isArray(friendList)) return [];

        const friendIds = friendList.map(f => new Types.ObjectId(f._id || f.userId || f.id));

        // Lấy các bạn bè chưa tham gia cộng đồng và không có lời mời pending
        const availableFriends = await this.memberModel
            .aggregate([
                {
                    $match: {
                        communityId: new Types.ObjectId(communityId),
                    },
                },
                {
                    $group: { _id: null, members: { $push: '$userId' } },
                },
            ]);

        const existingMemberIds = availableFriends[0]?.members || [];

        // Lấy bạn bè chưa mời và chưa là thành viên
        const pendingInvites = await this.requestModel.find({
            communityId: new Types.ObjectId(communityId),
            type: 'invite',
            status: 'pending',
            userId: { $in: friendIds },
        });

        const pendingInviteIds = pendingInvites.map(p => p.userId.toString());

        const availableFriendsData = friendList.filter(friend => {
            const friendId = (friend._id || friend.userId || friend.id).toString();
            return !existingMemberIds.some(m => m.toString() === friendId) && !pendingInviteIds.includes(friendId);
        });

        return availableFriendsData;
    }

    async inviteFriend(userId: string, communityId: string, targetUserId: string) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');
        if (!Types.ObjectId.isValid(targetUserId)) throw new BadRequestException('targetUserId không hợp lệ');

        const community = await this.findCommunityOrFail(communityId);

        // Kiểm tra user là thành viên cộng đồng
        const isMember = await this.memberModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: community._id,
        });
        if (!isMember) throw new ForbiddenException('Bạn không phải là thành viên cộng đồng');

        // Kiểm tra target user tồn tại
        const [userExists] = await this.eventEmitter.emitAsync(AppEvents.USER_CHECK_EXISTS, { userId: targetUserId });
        if (!userExists) throw new NotFoundException('Không tìm thấy người dùng');

        // Kiểm tra có phải bạn bè không
        const [isFriend] = await this.eventEmitter.emitAsync(AppEvents.CHECK_FRIEND_RELATIONSHIP, { userId, targetUserId });
        if (!isFriend) throw new ForbiddenException('Bạn không phải bạn bè của người này');

        // Kiểm tra đã là thành viên chưa
        const existing = await this.memberModel.findOne({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
        });
        if (existing) throw new BadRequestException('Người này đã là thành viên');

        // Kiểm tra đã có invite pending chưa
        const existingInvite = await this.requestModel.findOne({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
            type: 'invite',
            status: 'pending',
        });
        if (existingInvite) throw new BadRequestException('Đã gửi lời mời cho người này rồi');

        const invite = await this.requestModel.create({
            userId: new Types.ObjectId(targetUserId),
            communityId: community._id,
            type: 'invite',
            status: 'pending',
            senderId: new Types.ObjectId(userId),
        });

        this.eventEmitter.emit('community.invite', {
            receiver: targetUserId,
            sender: userId,
            type: NotificationType.COMMUNITY_INVITE,
            targetId: (invite._id as Types.ObjectId).toString(),
            message: ` đã mời bạn tham gia cộng đồng`,
            content: communityId,
            communityId: communityId.toString(),
        });

        return { message: 'Đã gửi lời mời thành công', inviteId: (invite._id as Types.ObjectId).toString() };
    }

    // ================================================================
    // COMMUNITY POSTS
    // ================================================================

    async getCommunityPosts(communityId: string, userId: string, page: number = 1, limit: number = 10) {
        if (!Types.ObjectId.isValid(communityId)) throw new BadRequestException('communityId không hợp lệ');

        // Chỉ thành viên mới được xem bài viết
        const isMember = await this.checkIsMember(userId, communityId);
        if (!isMember) throw new ForbiddenException('Bạn phải là thành viên để xem bài viết');

        const [posts] = await this.eventEmitter.emitAsync(AppEvents.COMMUNITY_GET_APPROVED_POSTS, {
            communityId,
            userId,
            page,
            limit,
        });

        return posts ?? { data: [], page, limit, total: 0, hasNext: false };
    }

    async getPendingPosts(adminId: string, communityId: string, page: number = 1, limit: number = 10) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        const [posts] = await this.eventEmitter.emitAsync(AppEvents.COMMUNITY_GET_PENDING_POSTS, {
            communityId,
            page,
            limit,
        });

        return posts ?? { data: [], page, limit, total: 0, hasNext: false };
    }

    async approvePost(adminId: string, communityId: string, postId: string, dto: ApprovePostDto) {
        const community = await this.findCommunityOrFail(communityId);
        this.assertAdmin(community, adminId);

        if (!Types.ObjectId.isValid(postId)) throw new BadRequestException('postId không hợp lệ');

        // Cập nhật communityStatus qua event (Post module sẽ handle)
        const newStatus =
            dto.action === PostAction.APPROVE ? CommunityPostStatus.APPROVED : CommunityPostStatus.REJECTED;

        const [result] = await this.eventEmitter.emitAsync('community.post.updateStatus', {
            postId,
            communityId,
            status: newStatus,
        });

        if (!result) throw new NotFoundException('Không tìm thấy bài viết trong cộng đồng này');

        // Thông báo cho tác giả bài viết
        const notificationType =
            dto.action === PostAction.APPROVE
                ? NotificationType.COMMUNITY_POST_APPROVED
                : NotificationType.COMMUNITY_POST_REJECTED;

        const message =
            dto.action === PostAction.APPROVE
                ? ` đã duyệt bài viết của bạn trong cộng đồng "${community.name}"`
                : ` đã từ chối bài viết của bạn trong cộng đồng "${community.name}"`;

        if (dto.action === PostAction.APPROVE) {
            this.eventEmitter.emit('community.post.approved', {
                receiver: result.userId.toString(),
                sender: adminId,
                postId: postId,
                communityId: communityId,
                communityName: community.name,
            });
        } else {
            this.eventEmitter.emit('community.post.rejected', {
                receiver: result.userId.toString(),
                sender: adminId,
                postId: postId,
                communityId: communityId,
                communityName: community.name,
            });
        }

        return {
            message: dto.action === PostAction.APPROVE ? 'Đã duyệt bài viết' : 'Đã từ chối bài viết',
        };
    }

    // ================================================================
    // EVENT LISTENERS (dùng bởi các module khác)
    // ================================================================

    @OnEvent(AppEvents.COMMUNITY_GET_INFO)
    async handleGetCommunityInfo(payload: { communityId: string }) {
        const community = await this.communityModel
            .findById(payload.communityId)
            .select('_id name adminId');

        if (!community) return null;

        return {
            id: community._id?.toString(),
            name: community.name,
            adminId: community.adminId,
        };
    }

    @OnEvent(AppEvents.COMMUNITY_GET_MEMBER_ROLE)
    async handleGetMemberRole(payload: { communityId: string; userId: string }) {
        const { communityId, userId } = payload;

        if (!Types.ObjectId.isValid(communityId) || !Types.ObjectId.isValid(userId)) {
            return { role: null };
        }

        const member = await this.memberModel
            .findOne({
                communityId: new Types.ObjectId(communityId),
                userId: new Types.ObjectId(userId),
            })
            .select('role')
            .lean();

        return { role: member?.role ?? null };
    }

    // ================================================================
    // PRIVATE HELPERS
    // ================================================================

    private async findCommunityOrFail(communityId: string): Promise<CommunityDocument> {
        if (!Types.ObjectId.isValid(communityId)) {
            throw new BadRequestException('communityId không hợp lệ');
        }

        const community = await this.communityModel.findById(communityId);
        if (!community) throw new NotFoundException('Không tìm thấy cộng đồng');
        return community;
    }

    private assertAdmin(community: CommunityDocument, userId: string): void {
        // Kiểm tra là admin của community (adminId = người tạo)
        // Hoặc có role admin trong bảng members
        if (community.adminId.toString() !== userId) {
            throw new ForbiddenException('Chỉ admin cộng đồng mới có quyền thực hiện thao tác này');
        }
    }

    private async checkIsMember(userId: string, communityId: string): Promise<boolean> {
        const member = await this.memberModel.findOne({
            userId: new Types.ObjectId(userId),
            communityId: new Types.ObjectId(communityId),
        });
        return !!member;
    }
}
