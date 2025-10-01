import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { PostUrl, PostUrlDocument } from './schemas/post-url.schema';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { UserService } from '../user/user.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { FriendsService } from '../friends/friends.service';
import { PrivacyType } from 'src/shared/enums/privacy_type';

@Injectable()
export class PostService {
    constructor(
        @InjectModel(Post.name) private postModel: Model<PostDocument>,
        @InjectModel(PostUrl.name) private postUrlModel: Model<PostUrlDocument>,
        private readonly userService: UserService,
        private readonly friendService: FriendsService,
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

    async getAllPostsByUser(ownerId: string, viewerId: string, page: number = 1, limit: number = 5) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }

        // nếu không có viewerId thì mặc định viewer chính là owner
        const effectiveViewerId = viewerId ?? ownerId;
        console.log('effectiveViewerId', effectiveViewerId);
        if (!Types.ObjectId.isValid(effectiveViewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        const userExist = await this.userService.checkUserExist(ownerId);
        if (!userExist) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const skip = (page - 1) * limit;

        const ownerObjectId = new Types.ObjectId(ownerId);

        const totalPosts = await this.postModel.countDocuments({ userId: ownerObjectId });

        const posts = await this.postModel
            .find({ userId: ownerObjectId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'username fullName avatarUrl')
            .populate({
                path: 'urls',
                options: { sort: { order: 1 } }, // sort ảnh theo order
            })
            .lean()
            .exec();

        // lọc theo quyền riêng tư
        const filteredPosts = (
            await Promise.all(
                posts.map(async (post) => {
                    const canView = await this.canUserViewPost(
                        post._id.toString(),
                        effectiveViewerId,
                    );
                    return canView ? post : null;
                }),
            )
        ).filter((p) => p !== null);
        const hasNext = skip + filteredPosts.length < totalPosts;

        return {
            data: filteredPosts,
            page,
            limit,
            total: filteredPosts.length,
            hasNext,
        };
    }

    async getAllPostsHomePage(viewerId: string, page: number = 1, limit: number = 5) {
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        // Lấy danh sách bạn bè
        const friends = await this.friendService.getFriends(viewerId);
        const friendIds = friends.map((f) => f._id);

        const skip = (page - 1) * limit;
        // Query post của bạn bè
        let posts = await this.postModel
            .find({ userId: { $in: friendIds } })
            .populate('userId', 'username fullName avatarUrl')
            .sort({ createdAt: -1 })
            // .skip(skip)
            // .limit(limit)
            .lean()
            .exec();

        // lọc theo quyền riêng tư
        const filteredPosts = (
            await Promise.all(
                posts.map(async (post) => {
                    const canView = await this.canUserViewPost(
                        post._id.toString(),
                        viewerId,
                    );
                    return canView ? post : null;
                }),
            )
        ).filter((p) => p !== null);
        console.log('filteredPosts', filteredPosts);
        // query post của mình
        const myPosts = await this.postModel
            .find({ userId: new Types.ObjectId(viewerId) })
            .populate('userId', 'username fullName avatarUrl')
            .sort({ createdAt: -1 })
            // .skip(skip)
            // .limit(limit)
            .lean()
            .exec();
        posts = [...filteredPosts, ...myPosts];
        console.log('posts', posts);
        // Nếu chưa đủ limit -> bổ sung post public
        if (posts.length < limit) {
            // const missing = limit - posts.length;

            let publicPosts = await this.postModel
                .find({
                    privacy_type: PrivacyType.PUBLIC,
                    userId: { $nin: friendIds }, // loại trừ bạn bè đã lấy
                })
                .populate('userId', 'username fullName avatarUrl')
                .sort({ createdAt: -1 })
                //  .limit(missing)
                .lean()
                .exec();

            // không lấy bài trung với myPosts
            publicPosts = publicPosts.filter(p => !myPosts.some(mp => mp._id.toString() === p._id.toString()));
            posts = [...posts, ...publicPosts];
        }

        // phân trang khúc này
        const pageItems = posts.slice(skip, skip + limit);
        const totalPosts = posts.length;

        const hasNext = skip + pageItems.length < totalPosts;

        return {
            data: pageItems,
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

    async getPostPrivacy(postId: string) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const postIdObject = new Types.ObjectId(postId);

        const post = await this.postModel.findById(postIdObject);
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        return post.privacy_type;
    }

    async updatePostPrivacy(postId: string, updatePostPrivacyDto: UpdatePrivacyDto) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const postIdObject = new Types.ObjectId(postId);

        let post = await this.postModel.findById(postIdObject);
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        post = PrivacyUtil.applyPrivacy(post, updatePostPrivacyDto);
        await post.save();

        return post;
    }

    // api check post privacy của user đó có thể xem được post này không
    // api kiểm tra xem mình có được quyền xem bài viết này không
    async canUserViewPost(postId: string, viewerId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        const post = await this.postModel.findById(postId).lean();
        if (!post) return false;

        // Lấy danh sách bạn bè của chủ post
        const friendsOfOwner = await this.friendService.getFriends(post.userId.toString());

        return PrivacyUtil.canView(
            new Types.ObjectId(viewerId),
            post,
            friendsOfOwner.map(f => new Types.ObjectId(f)),
        );
    }

}
