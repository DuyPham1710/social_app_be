import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CommentLog, CommentLogDocument } from './schemas/comment-log.schema';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
    constructor(
        @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
        @InjectModel(CommentLog.name) private readonly commentLogModel: Model<CommentLogDocument>,
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

        // Lưu nội dung cũ trước khi cập nhật
        const oldContent = comment.content;

        // Cập nhật nội dung mới
        comment.content = content;
        await comment.save();

        // Lưu lịch sử chỉnh sửa vào comment log
        const commentLog = new this.commentLogModel({
            commentId: new Types.ObjectId(commentId),
            oldContent: oldContent,
            newContent: content,
            editedBy: new Types.ObjectId(userId),
        });
        await commentLog.save();
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
        // Xóa tất cả lịch sử chỉnh sửa của comment
        await this.commentLogModel.deleteMany({ commentId: new Types.ObjectId(commentId) });
        return { deleted: true, id: commentId };
    }

    async findByPostId(postId: string) {
        // Validate postId
        if (!Types.ObjectId.isValid(postId)) {
            throw new NotFoundException('Invalid postId');
        }

        // Lấy tất cả comments của post, sắp xếp theo thời gian tạo
        let comments = await this.commentModel
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

        comments = comments.map((comment: any) => {
            if (comment && comment.userId && typeof comment.userId === 'object' && comment.userId._id) {
                comment.userId = {
                    userId: comment.userId._id,
                    fullName: comment.userId.fullName,
                    avatarUrl: comment.userId.avatarUrl,
                    username: comment.userId.username,
                };
            }

            if (comment && comment.parentId && comment.parentId.userId && typeof comment.parentId.userId === 'object' && comment.parentId.userId._id) {
                comment.parentId.userId = {
                    userId: comment.parentId.userId._id,
                    fullName: comment.parentId.userId.fullName,
                    avatarUrl: comment.parentId.userId.avatarUrl,
                    username: comment.parentId.userId.username,
                };
            }
            return comment;
        });


        return comments;
    }

    async getCommentEditHistory(commentId: string) {
        if (!Types.ObjectId.isValid(commentId)) {
            throw new NotFoundException('Invalid commentId');
        }

        // Lấy tất cả lịch sử chỉnh sửa của comment, sắp xếp theo thời gian tạo (cũ nhất trước)
        const editHistory = await this.commentLogModel
            .find({ commentId: new Types.ObjectId(commentId) })
            .sort({ createdAt: 1 })
            .populate({
                path: 'editedBy',
                select: 'username fullName avatarUrl email _id'
            })
            .exec();

        // Format lại dữ liệu editedBy để đồng nhất với format của userId trong comment
        const formattedHistory = editHistory.map((log: any) => {
            const logObj = log.toObject();
            if (logObj.editedBy && typeof logObj.editedBy === 'object' && logObj.editedBy._id) {
                logObj.editedBy = {
                    userId: logObj.editedBy._id,
                    fullName: logObj.editedBy.fullName,
                    avatarUrl: logObj.editedBy.avatarUrl,
                    username: logObj.editedBy.username,
                    email: logObj.editedBy.email,
                };
            }
            return logObj;
        });

        return formattedHistory;
    }
}
