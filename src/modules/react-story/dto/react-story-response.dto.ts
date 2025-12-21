import { Types } from "mongoose";
import { EmojiDocument } from "src/modules/emoji/schemas/emoji.schema";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { ReactStory } from "../schemas/react-story.schema";

export class ReactStoryResponseDto {
    _id: Types.ObjectId;
    userId: UserResponseDto;
    storyId: Types.ObjectId;
    emojiId: EmojiDocument;
    createdAt: Date;
    updatedAt: Date;
    mutualFriendsCount?: number;
    isFriend?: boolean;

    static fromReactStories(reactStories: ReactStory[]): ReactStoryResponseDto[] {
        const reactDtos: ReactStoryResponseDto[] = reactStories.map((react: any) => {
            return {
                _id: react._id,
                userId: {
                    userId: react.userId._id,
                    fullName: react.userId.fullName,
                    username: react.userId.username,
                    avatarUrl: react.userId.avatarUrl,
                },
                storyId: react.storyId,
                emojiId: react.emojiId,
                createdAt: react.createdAt,
                updatedAt: react.updatedAt,
                mutualFriendsCount: react.mutualFriendsCount,
                isFriend: react.isFriend,
            } as ReactStoryResponseDto;
        });
        return reactDtos;
    }
}

