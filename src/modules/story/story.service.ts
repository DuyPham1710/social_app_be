import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Story, StoryDocument } from './schemas/story.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStoryDto } from './dto/create-story.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { GroupedStoryListDto } from './dto/grouped-story-list.dto';
import { plainToInstance } from 'class-transformer';
import UserResponseDto from '../user/dto/user.response.dto';
import { StoryResponseDto } from './dto/story-response.dto';
import { uploadAudioFromUrl } from './helpers/upload-audio.helper';

@Injectable()
export class StoryService {
    constructor(
        @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async createStory(createStoryDto: CreateStoryDto, userId: string, file?: Express.Multer.File) {
        // Nếu có file, lấy mediaUrl từ file.path (CloudinaryStorage đã upload và trả về secure_url)
        if (file && file.path) {
            createStoryDto.mediaUrl = file.path;
        }

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
                // Có thể throw error hoặc chỉ log và tiếp tục với preview link gốc
                // throw new HttpException('Failed to upload audio', HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
        
        return savedStory;
    }

    async getStories(ownerId: string, viewerId: string) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
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

                // Convert to StoryResponseDto[]
                const storyDtos = filteredStories.map(story =>
                    plainToInstance(StoryResponseDto, story, { excludeExtraneousValues: true })
                );

                return {
                    user: userDto,
                    stories: storyDtos as StoryResponseDto[]
                };
            })
        );

        return {
            users,
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

        // Lấy danh sách bạn bè của chủ post
        const [friendsOfOwner] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: story.userId.toString() });
        //  const friendsOfOwner = await this.friendService.getFriends(story.userId.toString());

        return PrivacyUtil.canView(
            new Types.ObjectId(viewerId),
            story,
            friendsOfOwner.map(f => new Types.ObjectId(f._id)),
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
}
