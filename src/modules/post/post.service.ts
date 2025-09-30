import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { PostUrl, PostUrlDocument } from './schemas/post-url.schema';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { UserService } from '../user/user.service';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostService {
    constructor(
        @InjectModel(Post.name) private postModel: Model<PostDocument>,
        @InjectModel(PostUrl.name) private postUrlModel: Model<PostUrlDocument>,
        private readonly userService: UserService,
    ) { }

    async getPostDetail(postId: string) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const postObjectId = new Types.ObjectId(postId);

        const post = await this.postModel.findById(postObjectId).populate('userId', 'username fullName avatarUrl').populate({ path: 'urls', options: { sort: { order: 1 } } }).exec();
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        return post;
    }

    async getAllPostsByUser(userId: string, page: number = 1, limit: number = 5) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const userExist = await this.userService.checkUserExist(userId);
        if (!userExist) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const skip = (page - 1) * limit;

        const userObjectId = new Types.ObjectId(userId);

        const totalPosts = await this.postModel.countDocuments({ userId: userObjectId });

        const posts = await this.postModel
            .find({ userId: userObjectId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'username fullName avatarUrl')
            .populate({
                path: 'urls',
                options: { sort: { order: 1 } }, // sort ảnh theo order
            })
            .exec();

        const hasNext = skip + posts.length < totalPosts;

        return {
            data: posts,
            page,
            limit,
            total: totalPosts,
            hasNext,
        };
    }


    async createPost(createPostDto: CreatePostDto, userId: string) {
        const { caption, urls } = createPostDto;

        const post = await this.postModel.create({
            caption,
            userId: new Types.ObjectId(userId),
        });

        let postUrls: PostUrlDocument[] = [];
        if (urls && urls.length > 0) {
            postUrls = await this.postUrlModel.insertMany(
                urls.map((u, index) => ({
                    url: u.url,
                    title: u.title ?? '',
                    order: u.order ?? index,
                })),

            );
        }

        // update post urls
        post.urls = postUrls.map((url) => url._id as Types.ObjectId);
        await post.save();

        return {
            ...post.toObject(),
            urls: postUrls,
        };
    }

    async updatePost(updatePostDto: UpdatePostDto, userId: string) {
        if (!Types.ObjectId.isValid(updatePostDto.postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        // convert string to ObjectId
        const postIdObject = new Types.ObjectId(updatePostDto.postId);
        const userIdObject = new Types.ObjectId(userId);

        // check post có tồn tại và thuộc về user
        const post = await this.postModel.findOne({ _id: postIdObject, userId: userIdObject });
        if (!post) {
            throw new HttpException('Post not found or unauthorized', HttpStatus.NOT_FOUND);
        }

        if (updatePostDto.caption) {
            post.caption = updatePostDto.caption;
        }

        // Update urls
        if (updatePostDto.urls && updatePostDto.urls.length > 0) {
            // Xóa toàn bộ PostUrl cũ
            if (post.urls && post.urls.length > 0) {
                await this.postUrlModel.deleteMany({ _id: { $in: post.urls } });
            }

            // Insert urls mới
            const newUrls = await this.postUrlModel.insertMany(
                updatePostDto.urls.map((u, index) => ({
                    url: u.url,
                    title: u.title ?? '',
                    order: u.order ?? index,
                })),
            );

            // Gán lại mảng urls
            post.urls = newUrls.map(u => u._id as Types.ObjectId);
        }

        await post.save();

        // Trả về post kèm populate
        return this.postModel
            .findById(post._id)
            .populate('userId', 'username fullName avatarUrl')
            .populate({ path: 'urls', options: { sort: { order: 1 } } })
            .exec();
    }


    async deletePost(postId: string, userId: string) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const postIdObject = new Types.ObjectId(postId);
        const userIdObject = new Types.ObjectId(userId);

        const post = await this.postModel.findOne({ _id: postIdObject, userId: userIdObject });
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        if (post.userId.toString() !== userId) {
            throw new ForbiddenException('You are not allowed to update this post');
        }

        if (post.urls && post.urls.length > 0) {
            await this.postUrlModel.deleteMany({ _id: { $in: post.urls } });
        }

        await post.deleteOne();

        return { message: 'Post deleted successfully' };
    }
}
