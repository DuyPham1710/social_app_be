import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Story, StoryDocument } from './schemas/story.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStoryDto } from './dto/create-story.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { GroupedStoryListDto } from './dto/grouped-story-list.dto';
import { plainToInstance } from 'class-transformer';
import UserResponseDto from '../user/dto/user.response.dto';
import { StoryResponseDto } from './dto/story-response.dto';
import { ReactStoryResponseDto } from '../react-story/dto/react-story-response.dto';
import { uploadAudioFromUrl } from './helpers/upload-audio.helper';
import { omitBy, isUndefined } from 'lodash';
import { File } from 'multer';
import { ImageModerationService } from 'src/shared/services/image-moderation.service';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';

@Injectable()
export class StoryService {
    private readonly logger = new Logger(StoryService.name);

    constructor(
        @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
        private readonly eventEmitter: EventEmitter2,
        private readonly imageModerationService: ImageModerationService,
    ) { }

    async createStory(createStoryDto: CreateStoryDto, userId: string, file?: File) {
        // Kiểm duyệt hình ảnh bằng AI trước khi upload
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

        // Upload file từ disk lên Cloudinary
        if (file && file.path) {
            try {
                const isVideo = file.mimetype?.startsWith('video/');
                const isImage = file.mimetype?.startsWith('image/');

                const uploadOptions: any = {
                    folder: 'stories',
                };

                if (isVideo) {
                    uploadOptions.resource_type = 'video';
                    uploadOptions.transformation = [
                        { width: 1920, height: 1080, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
                    ];
                } else if (isImage) {
                    uploadOptions.resource_type = 'image';
                    uploadOptions.transformation = [{ width: 1080, height: 1920, crop: 'limit' }];
                } else {
                    uploadOptions.resource_type = 'auto';
                }

                const result = await cloudinary.uploader.upload(file.path, uploadOptions);
                createStoryDto.mediaUrl = result.secure_url;
            } finally {
                // Luôn xóa file tạm sau khi upload
                this.cleanupTempFile(file);
            }
        }

        // Tạo story trong database
        const story = new this.storyModel({
            ...createStoryDto,
            userId: new Types.ObjectId(userId),
        });

        // Lưu story trước để có storyId
        const savedStory = await story.save();

        // Nếu có music và có preview link, tải audio và upload lên Cloudinary
        if (createStoryDto.music?.preview) {
            try {
                const cloudinaryAudioUrl = await uploadAudioFromUrl(
                    createStoryDto.music.preview,
                    savedStory._id.toString(),
                );

                // Cập nhật music object với link Cloudinary
                savedStory.music = {
                    ...createStoryDto.music,
                    preview: cloudinaryAudioUrl, // Thay thế preview link bằng link Cloudinary
                };

                await savedStory.save();
            } catch (error) {
                // Nếu upload thất bại, vẫn giữ nguyên preview link gốc
                console.error('Failed to upload audio to Cloudinary:', error);
            }
        }

        return savedStory;
    }


    // Xóa file tạm trên disk sau khi xử lý xong
    private cleanupTempFile(file: File): void {
        try {
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
                this.logger.debug(`Đã xóa file tạm: ${file.path}`);
            }
        } catch (error) {
            this.logger.warn(`Không thể xóa file tạm ${file.path}: ${error.message}`);
        }
    }

    async getStories(ownerId: string, viewerId: string) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }
        else {
            const [isAdmin] = await this.eventEmitter.emitAsync(AppEvents.USER_IS_ADMIN, { userId: viewerId });
            if (isAdmin) {
                viewerId = ownerId;
            }
        }

        const stories: StoryDocument[] = await this.storyModel
            .find({ userId: new Types.ObjectId(ownerId) })
            .populate('userId', 'username fullName avatarUrl')
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        if (ownerId === viewerId) {
            return stories;
        }

        // kiểm tra xem viewer có quyền xem story này không
        const filteredStories = (
            await Promise.all(
                stories.map(async (story) => {
                    const canView = await this.canUserViewStory(story._id.toString(), viewerId);
                    return canView ? story : null;
                }),
            )
        ).filter((s) => s !== null);

        return filteredStories;
    }

    async getAllStoriesHomePage(viewerId: string, page: number = 1, limit: number = 10): Promise<GroupedStoryListDto> {
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        // Lấy danh sách bạn bè
        const emitResults = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerId });
        let friends: any[] = [];
        if (Array.isArray(emitResults) && emitResults.length === 1 && Array.isArray(emitResults[0])) {
            friends = emitResults[0];
        } else if (Array.isArray(emitResults)) {
            const firstArray = emitResults.find(r => Array.isArray(r));
            if (firstArray) friends = firstArray as any[];
            else friends = emitResults as any[];
        } else if (Array.isArray((emitResults as any))) {
            friends = emitResults as any[];
        }

        // Phân trang theo user (bạn bè)
        const total = friends.length;
        const totalPages = Math.ceil(total / limit);
        const hasNext = page < totalPages;
        const paginatedFriends = friends.slice((page - 1) * limit, page * limit);

        //const expireTime = new Date(Date.now() - 1 * 60 * 1000);
        const expireTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Lấy story của từng bạn bè, gom lại
        const users = await Promise.all(
            paginatedFriends.map(async (friend) => {
                // Convert friend to UserResponseDto
                const userDto = plainToInstance(UserResponseDto, friend, { excludeExtraneousValues: true });

                // Lấy tất cả story của user này
                const stories: StoryDocument[] = await this.storyModel
                    .find({
                        userId: friend._id,
                        createdAt: { $gte: expireTime } // chỉ lấy story trong 24h gần nhất
                    })
                    .populate('userId', 'username fullName avatarUrl')
                    .sort({ createdAt: 1 })
                    .lean()
                    .exec();

                // Filter story theo quyền riêng tư
                const filteredStories = (
                    await Promise.all(
                        stories.map(async (story) => {
                            const canView = await this.canUserViewStory(story._id.toString(), viewerId);
                            return canView ? story : null;
                        })
                    )
                ).filter((s) => s !== null);

                // Lấy danh sách react của từng story thông qua event emitter
                const storyIds = filteredStories.map(s => s._id.toString());
                const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_STORY_GET, { storyIds, viewerId });
                const [reactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_STORY_FIND_BY_USER, { userId: viewerId, storyIds });

                // Convert to StoryResponseDto[]
                const storyDtos = filteredStories.map(story => {
                    const reacts = (reactsMap[story._id.toString()] || []).map((react: any) =>
                        plainToInstance(ReactStoryResponseDto, react, { excludeExtraneousValues: true })
                    );

                    const storyObj = {
                        ...story,
                        id: story.id?.toString(),
                        reacts: reacts,
                        isReact: reactMap[story._id.toString()] || null,
                    };
                    return plainToInstance(StoryResponseDto, storyObj, { excludeExtraneousValues: true });
                });

                return {
                    user: userDto,
                    stories: storyDtos as StoryResponseDto[]
                };
            })
        );

        // Nếu là trang đầu tiên, thêm story của người đăng nhập lên đầu nếu có
        let finalUsers = users;
        if (page === 1) {
            // Lấy thông tin user đăng nhập
            const [currentUserResult] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_ONE, { userId: viewerId });
            let currentUserDto: UserResponseDto | null = null;

            // Xử lý kết quả từ event emitter
            if (currentUserResult && !currentUserResult.error) {
                // currentUserResult đã là UserResponseDto từ USER_FIND_ONE event
                currentUserDto = currentUserResult as UserResponseDto;
            }

            if (currentUserDto && currentUserDto.userId) {
                // Lấy story của người đăng nhập
                const currentUserStories: StoryDocument[] = await this.storyModel
                    .find({
                        userId: new Types.ObjectId(viewerId),
                        createdAt: { $gte: expireTime }
                    })
                    .populate('userId', 'username fullName avatarUrl')
                    .sort({ createdAt: 1 })
                    .lean()
                    .exec();

                // Lấy danh sách react của từng story thông qua event emitter
                const currentUserStoryIds = currentUserStories.map(s => s._id.toString());
                const [currentUserReactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_STORY_GET, { storyIds: currentUserStoryIds, viewerId });
                const [currentUserReactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_STORY_FIND_BY_USER, { userId: viewerId, storyIds: currentUserStoryIds });

                // Convert to StoryResponseDto[]
                const currentUserStoryDtos = currentUserStories.map(story => {
                    const reacts = (currentUserReactsMap[story._id.toString()] || []).map((react: any) =>
                        plainToInstance(ReactStoryResponseDto, react, { excludeExtraneousValues: true })
                    );

                    const storyObj = {
                        ...story,
                        id: story.id?.toString(),
                        reacts: reacts,
                        isReact: currentUserReactMap[story._id.toString()] || null,
                    };
                    return plainToInstance(StoryResponseDto, storyObj, { excludeExtraneousValues: true });
                });

                // Chỉ thêm vào đầu nếu có story
                if (currentUserStoryDtos.length > 0) {
                    finalUsers = [
                        {
                            user: currentUserDto,
                            stories: currentUserStoryDtos as StoryResponseDto[]
                        },
                        ...users
                    ];
                }
            }
        }

        return {
            users: finalUsers,
            page,
            limit,
            total,
            hasNext
        };
    }

    async getStoryPrivacy(storyId: string) {
        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        const storyIdObject = new Types.ObjectId(storyId);

        const story = await this.storyModel.findById(storyIdObject);
        if (!story) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        return story.privacy_type;
    }

    async updateStoryPrivacy(storyId: string, updatePostPrivacyDto: UpdatePrivacyDto) {
        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        const storyIdObject = new Types.ObjectId(storyId);

        let story = await this.storyModel.findById(storyIdObject);
        if (!story) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        story = PrivacyUtil.applyPrivacy(story, updatePostPrivacyDto);
        await story.save();

        return story;
    }

    async canUserViewStory(storyId: string, viewerId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        const story = await this.storyModel.findById(storyId).lean();
        if (!story) return false;

        const [isAdmin] = await this.eventEmitter.emitAsync(AppEvents.USER_IS_ADMIN, { userId: viewerId });
        if (isAdmin) return true;

        const [friendsOfOwner] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: story.userId.toString() });
        //  const friendsOfOwner = await this.friendService.getFriends(story.userId.toString());

        return PrivacyUtil.canView(
            new Types.ObjectId(viewerId),
            story,
            friendsOfOwner.map(f => new Types.ObjectId(f._id)),
        );
    }

    async getStoryDetail(storyId: string, viewerId: string) {
        const canView = await this.canUserViewStory(storyId, viewerId);
        if (!canView) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        const storyObjectId = new Types.ObjectId(storyId);

        const story = await this.storyModel
            .findOne({ _id: storyObjectId })
            .populate('userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!story) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        const userResponseDto: any = plainToInstance(
            UserResponseDto,
            story.userId,
            {
                excludeExtraneousValues: true,
            },
        );
        const cleanedUser = omitBy(userResponseDto, isUndefined) as UserResponseDto;

        return plainToInstance(
            StoryResponseDto,
            {
                ...story,
                userId: cleanedUser,
            },
            { excludeExtraneousValues: true },
        );
    }

    async deleteStory(storyId: string, ownerId: string) {
        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        const story = await this.storyModel.findById(storyId);
        if (!story) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        if (story.userId.toString() !== ownerId) {
            throw new ForbiddenException('You are not allowed to delete this story');
        }

        await story.deleteOne();

        return { message: 'Story deleted successfully' };
    }

    @OnEvent(AppEvents.STORY_GET_USER_ID)
    async handleStoryGetUserId(payload: any) {
        const story = await this.storyModel.findById(payload.storyId).select('userId');
        if (!story) return;
        return story;
    }

    @OnEvent(AppEvents.STORY_GET)
    async handleGetStories(payload: { ownerId: string, viewerId: string, storyId?: string }) {
        const { ownerId, viewerId, storyId } = payload;

        // Nếu có storyId, trả về story cụ thể đó
        if (storyId) {
            return await this.getStoryDetail(storyId, viewerId);
        }

        // Nếu không có storyId, trả về danh sách stories của ownerId
        return await this.getStories(ownerId, viewerId);
    }

    // ===== ADMIN EVENT LISTENERS =====
    @OnEvent(AppEvents.ADMIN_STORY_GET_ALL)
    async handleAdminGetAllStories(payload: {
        page?: number;
        limit?: number;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const { page = 1, limit = 10, dateFrom, dateTo } = payload;
        const skip = (page - 1) * limit;
        const query: any = {};

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                query.createdAt.$gte = dateFrom;
            }
            if (dateTo) {
                query.createdAt.$lte = dateTo;
            }
        }

        const [stories, total] = await Promise.all([
            this.storyModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username fullName avatarUrl')
                .lean()
                .exec(),
            this.storyModel.countDocuments(query).exec(),
        ]);

        const storyResponseDtos = stories.map((story: any) => {
            const userResponseDto: any = plainToInstance(
                UserResponseDto,
                story.userId,
                {
                    excludeExtraneousValues: true,
                },
            );
            const cleanedUser = omitBy(userResponseDto, isUndefined) as UserResponseDto;

            return plainToInstance(
                StoryResponseDto,
                {
                    ...story,
                    userId: cleanedUser,
                },
                { excludeExtraneousValues: true },
            );
        });

        return {
            data: storyResponseDtos,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1,
            },
        };
    }

    @OnEvent(AppEvents.ADMIN_STORY_DELETE)
    async handleAdminDeleteStory({ storyId }: { storyId: string }) {
        if (!Types.ObjectId.isValid(storyId)) {
            throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
        }

        const story = await this.storyModel.findById(storyId).exec();
        if (!story) {
            throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
        }

        await story.deleteOne();

        return { message: 'Story deleted successfully' };
    }

    @OnEvent(AppEvents.ADMIN_DASHBOARD_STATS)
    async handleAdminDashboardStats() {
        const totalStories = await this.storyModel.countDocuments().exec();
        return {
            totalStories,
        };
    }
}
