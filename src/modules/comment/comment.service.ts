import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
    constructor(
        @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    ) { }

    async create(createCommentDto: CreateCommentDto, userId: string) {
        const { content, postId, parentId } = createCommentDto;

        const comment = new this.commentModel({
            content,
            userId: new Types.ObjectId(userId),
            postId: new Types.ObjectId(postId),
            parentId: parentId ? new Types.ObjectId(parentId) : null,
        });

        const saved = await comment.save();

        // Populate user information và parent comment nếu có
        return await saved.populate([
            {
                path: 'userId',
                select: 'username fullName avatarUrl email _id'
            },
            {
                path: 'parentId',
                select: 'content userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            }
        ]);
    }

    async update(commentId: string, content: string, userId: string) {
        const comment = await this.commentModel.findById(commentId);
        if (!comment) {
            throw new NotFoundException('Comment not found');
        }
        if (comment.userId.toString() !== userId) {
            throw new ForbiddenException('You are not allowed to edit this comment');
        }

        comment.content = content;
        await comment.save();

        // Populate user information và parent comment nếu có
        return await comment.populate([
            {
                path: 'userId',
                select: 'username fullName avatarUrl email _id'
            },
            {
                path: 'parentId',
                select: 'content userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            }
        ]);
    }

    async remove(commentId: string, userId: string) {
        const comment = await this.commentModel.findById(commentId);
        if (!comment) {
            throw new NotFoundException('Comment not found');
        }
        if (comment.userId.toString() !== userId) {
            throw new ForbiddenException('You are not allowed to delete this comment');
        }
        await this.commentModel.deleteOne({ _id: comment._id });
        return { deleted: true, id: commentId };
    }

    async findByPostId(postId: string) {
        // Validate postId
        if (!Types.ObjectId.isValid(postId)) {
            throw new NotFoundException('Invalid postId');
        }

        // Lấy tất cả comments của post, sắp xếp theo thời gian tạo
        const comments = await this.commentModel
            .find({ postId: new Types.ObjectId(postId) })
            .sort({ createdAt: 1 }) // Sắp xếp tăng dần theo thời gian (comment cũ nhất trước)
            .populate([
                {
                    path: 'userId',
                    select: 'username fullName avatarUrl email _id'
                },
                {
                    path: 'parentId',
                    select: 'content userId createdAt',
                    populate: {
                        path: 'userId',
                        select: 'username fullName avatarUrl'
                    }
                }
            ])
            .exec();

        return comments;
    }
}
