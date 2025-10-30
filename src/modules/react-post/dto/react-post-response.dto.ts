import { Types } from "mongoose";
import { EmojiDocument } from "src/modules/emoji/schemas/emoji.schema";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { ReactPost } from "../schemas/react-post.schema";

export class ReactPostResponseDto {
    _id: Types.ObjectId;
    userId: UserResponseDto;
    postId: Types.ObjectId;
    emojiId: EmojiDocument;
    createdAt: Date;
    updatedAt: Date;
    mutualFriendsCount?: number;

    static fromReactPosts(reactPosts: ReactPost[]): ReactPostResponseDto[] {
        const reactDtos: ReactPostResponseDto[] = reactPosts.map((react: any) => {
            return {
                _id: react._id,
                userId: {
                    userId: react.userId._id,
                    fullName: react.userId.fullName,
                    username: react.userId.username,
                    avatarUrl: react.userId.avatarUrl,
                },
                postId: react.postId,
                emojiId: react.emojiId,
                createdAt: react.createdAt,
                updatedAt: react.updatedAt,
                mutualFriendsCount: react.mutualFriendsCount,
            } as ReactPostResponseDto;
        });
        return reactDtos;
    }
}