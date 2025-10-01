import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Story, StoryDocument } from './schemas/story.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStoryDto } from './dto/create-story.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class StoryService {
    constructor(
        @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
        private readonly friendService: FriendsService,
    ) { }

    async createStory(createStoryDto: CreateStoryDto, userId: string) {
        const story = new this.storyModel({
            ...createStoryDto,
            userId: new Types.ObjectId(userId),
        });
        return story.save();
    }

    async getStories(ownerId: string, viewerId: string) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        const stories = await this.storyModel
            .find({ userId: new Types.ObjectId(ownerId) })
            .populate('userId', 'username fullName avatarUrl')
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        if (ownerId === viewerId) {
            return stories;
        }

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
        const friendsOfOwner = await this.friendService.getFriends(story.userId.toString());

        return PrivacyUtil.canView(
            new Types.ObjectId(viewerId),
            story,
            friendsOfOwner.map(f => new Types.ObjectId(f)),
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
