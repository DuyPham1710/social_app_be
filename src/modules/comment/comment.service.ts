import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CommentLog, CommentLogDocument } from './schemas/comment-log.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { NotificationType } from 'src/shared/enums/notification_type';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { TextModerationService } from 'src/shared/services/text-moderation.service';

@Injectable()
export class CommentService {
    constructor(
        @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
        @InjectModel(CommentLog.name) private readonly commentLogModel: Model<CommentLogDocument>,
        private eventEmitter: EventEmitter2,
        private readonly textModerationService: TextModerationService,
    ) { }

    async checkCommentContent(content: string) {
        if (content && content.trim().length > 0) {
            const textResult = await this.textModerationService.checkText(content);
            if (!textResult.is_safe) {
                throw new BadRequestException(
                    'Nội dung bình luận vi phạm tiêu chuẩn cộng đồng! Vui lòng chỉnh sửa nội dung.',
                );
            }
        }
    }

    async create(createCommentDto: CreateCommentDto, userId: string) {
        const { content, postId, parentId, taggedUserIds } = createCommentDto;

        // Kiểm duyệt nội dung comment
        await this.checkCommentContent(content);

        const uniqueTaggedIds = taggedUserIds
            ? [...new Set(taggedUserIds)].map(id => new Types.ObjectId(id))
            : [];


        const comment = new this.commentModel({
            content,
            userId: new Types.ObjectId(userId),
            postId: new Types.ObjectId(postId),
            parentId: parentId ? new Types.ObjectId(parentId) : null,
            taggedUserIds: uniqueTaggedIds,
        });

        const saved = await comment.save();
        const [post] = await this.eventEmitter.emitAsync(AppEvents.POST_GET_USER_ID, { postId: createCommentDto.postId });
        const postOwnerId = post?.userId;
        const populated = await saved.populate([
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
            },
            {
                path: 'taggedUserIds',
                select: 'username fullName avatarUrl _id'
            }
        ]);

        const user = populated.userId as any;

        if (uniqueTaggedIds.length > 0) {
            uniqueTaggedIds.forEach(async taggedId => {
                if (taggedId.toString() !== userId) {
                    const canView = await this.eventEmitter.emitAsync(AppEvents.POST_CAN_VIEW, { postId: postId.toString(), viewerId: taggedId.toString() });

                    if (canView[0]) {
                        this.eventEmitter.emit('comment.tagged', {
                            receiver: taggedId.toString(),
                            sender: userId,
                            postId: postId,
                            commentId: saved._id,
                            content: saved.content,
                            type: NotificationType.MENTION,
                            user: {
                                fullName: user.fullName,
                                username: user.username,
                                avatarUrl: user.avatarUrl
                            }
                        });
                    }
                }
            });
        }
        else {
            if (postOwnerId && postOwnerId.toString() !== userId) {
                this.eventEmitter.emit('comment.created', {
                    receiver: postOwnerId.toString(),
                    sender: userId,
                    commentId: saved._id,
                    content: saved.content,
                    postId: postId,
                    type: NotificationType.POST_COMMENT,
                    user: {
                        fullName: user.fullName,
                        username: user.username,
                        avatarUrl: user.avatarUrl
                    }
                });
            }
        }
        return populated;
    }

    async update(commentId: string, content: string, userId: string) {
        const comment = await this.commentModel.findById(commentId);

        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        if (comment.userId.toString() !== userId) {
            throw new ForbiddenException('You are not allowed to edit this comment');
        }

        // Kiểm duyệt nội dung comment
        await this.checkCommentContent(content);

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

    async findByPostId(postId: string, viewerId?: string) {
        // Validate postId
        if (!Types.ObjectId.isValid(postId)) {
            throw new NotFoundException('Invalid postId');
        }

        // Lấy tất cả comments của post, sắp xếp theo thời gian tạo
        let comments: any[] = await this.commentModel
            .find({ postId: new Types.ObjectId(postId) })
            .sort({ createdAt: 1 }) // Sắp xếp tăng dần theo thời gian (comment cũ nhất trước)
            .populate([
                {
                    path: 'userId',
                    select: 'username fullName avatarUrl email _id',
                },
                {
                    path: 'parentId',
                    select: 'content userId createdAt',
                    populate: {
                        path: 'userId',
                        select: 'username fullName avatarUrl',
                    },
                },
                {
                    path: 'taggedUserIds',
                    select: '_id fullName avatarUrl username',
                }
            ])
            .lean()
            .exec();

        // Chuẩn hóa userId / parentId.userId giống trước đây
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
            if (Array.isArray(comment.taggedUserIds)) {
                comment.taggedUserIds = comment.taggedUserIds.map((u: any) => {
                    if (u && u._id) {
                        return {
                            userId: u._id,
                            fullName: u.fullName,
                            avatarUrl: u.avatarUrl,
                            username: u.username,
                        };
                    }
                    return u;
                });
            }
            return comment;
        });

        // Lấy danh sách react cho từng comment thông qua ReactCommentService
        const commentIds = comments.map((c: any) => c._id?.toString()).filter(Boolean);

        if (commentIds.length > 0) {
            try {
                const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_COMMENT_GET, {
                    commentIds,
                    viewerId,
                });

                comments = comments.map((comment: any) => {
                    const id = comment._id?.toString();
                    comment.reacts = (reactsMap && reactsMap[id]) ? reactsMap[id] : [];
                    return comment;
                });
            } catch (e) {
                // Nếu lỗi khi lấy reacts thì vẫn trả về comments bình thường
            }
        }

        // Log để debug số lượng reacts trên mỗi comment
        // console.log(
        //     '[CommentService] findByPostId result:',
        //     comments.map((c: any) => ({
        //         id: c._id?.toString(),
        //         reactsCount: Array.isArray(c.reacts) ? c.reacts.length : 0,
        //     })),
        // );

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

    @OnEvent(AppEvents.COMMENT_GET_USER_ID)
    async handleCommentGetUserId(payload: any) {
        const comment = await this.commentModel.findById(payload.commentId).select('userId postId');
        if (!comment) return;
        return comment;
    }

    @OnEvent(AppEvents.COMMENT_FIND_BY_POST_ID)
    async handleFindByPostId(payload: { postId: string, viewerId?: string }) {
        const { postId, viewerId } = payload;
        return await this.findByPostId(postId, viewerId);
    }

    // ===== ADMIN EVENT LISTENERS =====
    @OnEvent(AppEvents.ADMIN_COMMENT_GET_ALL)
    async handleAdminGetAllComments(payload: {
        page?: number;
        limit?: number;
        search?: string;
        postId?: string;
        userId?: string;
    }) {
        const { page = 1, limit = 10, search, postId, userId } = payload;
        const skip = (page - 1) * limit;
        const query: any = {};

        if (search && search.trim()) {
            query.content = { $regex: search.trim(), $options: 'i' };
        }

        if (postId && Types.ObjectId.isValid(postId)) {
            query.postId = new Types.ObjectId(postId);
        }

        if (userId && Types.ObjectId.isValid(userId)) {
            query.userId = new Types.ObjectId(userId);
        }

        const [comments, total] = await Promise.all([
            this.commentModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username fullName avatarUrl email')
                .populate('postId', 'caption')
                .populate({
                    path: 'parentId',
                    select: 'content userId createdAt',
                    populate: {
                        path: 'userId',
                        select: 'username fullName avatarUrl',
                    },
                })
                .lean()
                .exec(),
            this.commentModel.countDocuments(query).exec(),
        ]);

        return {
            data: comments,
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

    @OnEvent(AppEvents.ADMIN_COMMENT_GET_BY_ID)
    async handleAdminGetCommentById({ commentId }: { commentId: string }) {
        if (!Types.ObjectId.isValid(commentId)) {
            throw new NotFoundException('Invalid commentId');
        }

        const comment = await this.commentModel
            .findById(commentId)
            .populate('userId', 'username fullName avatarUrl email')
            .populate('postId', 'caption')
            .populate({
                path: 'parentId',
                select: 'content userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl',
                },
            })
            .lean()
            .exec();

        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        return comment;
    }

    @OnEvent(AppEvents.ADMIN_COMMENT_DELETE)
    async handleAdminDeleteComment({ commentId }: { commentId: string }) {
        if (!Types.ObjectId.isValid(commentId)) {
            throw new NotFoundException('Invalid commentId');
        }

        const comment = await this.commentModel.findById(commentId).exec();
        if (!comment) {
            throw new NotFoundException('Comment not found');
        }

        await comment.deleteOne();

        return { message: 'Comment deleted successfully' };
    }

    @OnEvent(AppEvents.ADMIN_COMMENT_FIND_BY_USER)
    async handleAdminFindCommentsByUser({ userId }: { userId: string }) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new NotFoundException('Invalid userId');
        }

        const comments = await this.commentModel
            .find({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('postId', 'caption')
            .populate('userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        return comments || [];
    }

    @OnEvent(AppEvents.ADMIN_DASHBOARD_STATS)
    async handleAdminDashboardStats() {
        const totalComments = await this.commentModel.countDocuments().exec();
        return {
            totalComments,
        };
    }
}
