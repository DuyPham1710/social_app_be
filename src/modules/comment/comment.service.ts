import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
    // constructor(
    //     @InjectModel(Comment.name)
    //     private readonly commentModel: Model<CommentDocument>,
    // ) { }

    // async create(createCommentDto: CreateCommentDto, userId: string) {
    //     const { content, postId, parentId } = createCommentDto;

    //     const comment = new this.commentModel({
    //         content,
    //         userId: new Types.ObjectId(userId),
    //         postId: new Types.ObjectId(postId),
    //         parentId: parentId ? new Types.ObjectId(parentId) : null,
    //     });

    //     const saved = await comment.save();
    //     return saved.populate('userId', 'username fullName avatarUrl');
    // }
}
