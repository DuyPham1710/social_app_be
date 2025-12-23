import { Expose, Transform, Type } from "class-transformer";
import { Types } from "mongoose";
import { EmojiDocument } from "src/modules/emoji/schemas/emoji.schema";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { ReactStory } from "../schemas/react-story.schema";

export class ReactStoryResponseDto {
    @Expose()
    @Transform(({ obj }) => obj._id?.toString() || obj.id?.toString())
    _id: string;

    @Expose()
    @Type(() => UserResponseDto)
    userId: UserResponseDto;

    @Expose()
    @Transform(({ obj }) => obj.storyId?.toString() || obj.storyId)
    storyId: string;

    @Expose()
    @Transform(({ obj }) => {
        // Đảm bảo emojiId có _id là emoji ID, không phải react story ID
        if (obj.emojiId) {
            return {
                _id: obj.emojiId._id?.toString() || obj.emojiId.toString(),
                label: obj.emojiId.label,
                icon: obj.emojiId.icon,
            };
        }
        return null;
    })
    emojiId: {
        _id: string;
        label: string;
        icon: string;
    };

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Expose()
    mutualFriendsCount?: number;

    @Expose()
    isFriend?: boolean;

    static fromReactStories(reactStories: ReactStory[]): ReactStoryResponseDto[] {
        const reactDtos: ReactStoryResponseDto[] = reactStories.map((react: any) => {
            return {
                _id: react._id?.toString() || react._id,
                userId: {
                    userId: react.userId._id?.toString() || react.userId._id,
                    fullName: react.userId.fullName,
                    username: react.userId.username,
                    avatarUrl: react.userId.avatarUrl,
                },
                storyId: react.storyId?.toString() || react.storyId,
                emojiId: {
                    _id: react.emojiId._id?.toString() || react.emojiId.toString(),
                    label: react.emojiId.label,
                    icon: react.emojiId.icon,
                },
                createdAt: react.createdAt,
                updatedAt: react.updatedAt,
                mutualFriendsCount: react.mutualFriendsCount,
                isFriend: react.isFriend,
            } as ReactStoryResponseDto;
        });
        return reactDtos;
    }
}





