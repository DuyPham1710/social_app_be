import { Types } from "mongoose";
import { EmojiDocument } from "src/modules/emoji/schemas/emoji.schema";
import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { ReactComment } from "../schemas/react-comment.schema";
export class ReactCommentResponseDto {
    _id: Types.ObjectId;
    userId: UserResponseDto;
    commentId: Types.ObjectId;
    emojiId: EmojiDocument;
    createdAt: Date;
    updatedAt: Date;
    mutualFriendsCount?: number;
    isFriend?: boolean;

    static fromReactComments(reactComments: ReactComment[]): ReactCommentResponseDto[] {
        const reactDtos: ReactCommentResponseDto[] = reactComments.map((react: any) => {
            return {
                _id: react._id,
                userId: {
                    userId: react.userId._id,
                    fullName: react.userId.fullName,
                    username: react.userId.username,
                    avatarUrl: react.userId.avatarUrl,
                },
                commentId: react.commentId,
                emojiId: react.emojiId,
                createdAt: react.createdAt,
                updatedAt: react.updatedAt,
                mutualFriendsCount: react.mutualFriendsCount,
                isFriend: react.isFriend,
            } as ReactCommentResponseDto;
        });
        return reactDtos;
    }
}