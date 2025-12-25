import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { PostUrl, PostUrlDocument } from './schemas/post-url.schema';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { PostResponseDto } from './dto/post-response.dto';
import { PostListDto } from './dto/post-list.dto';
import { plainToInstance } from 'class-transformer';
import UserResponseDto from '../user/dto/user.response.dto';
import { omitBy, isUndefined } from 'lodash';
import { v2 as cloudinary } from 'cloudinary';
import { PostReport, PostReportDocument } from './schemas/post-report.schema';
import { ReportPostDto } from './dto/report-post.dto';
import { File } from 'multer';

@Injectable()
export class PostService {
    constructor(
        @InjectModel(Post.name) private postModel: Model<PostDocument>,
        @InjectModel(PostUrl.name) private postUrlModel: Model<PostUrlDocument>,
        @InjectModel(PostReport.name) private postReportModel: Model<PostReportDocument>,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async getPostDetail(postId: string, userId: string): Promise<PostResponseDto> {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const postObjectId = new Types.ObjectId(postId);

        const post = await this.postModel.findOne({ _id: postObjectId, isHidden: { $ne: true } }).populate('userId', 'username fullName avatarUrl').populate({ path: 'urls', options: { sort: { order: 1 } } }).exec();
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        const userResponseDto: UserResponseDto = plainToInstance(UserResponseDto, post.userId, {
            excludeExtraneousValues: true
        });
        const cleanedUser = omitBy(userResponseDto, isUndefined) as UserResponseDto;

        // Lấy danh sách react của từng post thông qua event emitter
        const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_GET, { postIds: [postId], viewerId: userId });
        const [reactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_FIND_BY_USER, { userId: userId, postIds: [postId] });

        return {
            ...post.toObject(),
            userId: cleanedUser,
            reacts: reactsMap[postId] || [],
            isReact: reactMap[postId] || null
        } as unknown as PostResponseDto;
    }

    async getAllPostsByUser(ownerId: string, viewerId: string, page: number = 1, limit: number = 5) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }

        // nếu không có viewerId thì mặc định viewer chính là owner
        const effectiveViewerId = viewerId ?? ownerId;
        //  console.log('effectiveViewerId', effectiveViewerId);
        if (!Types.ObjectId.isValid(effectiveViewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        const [userExist] = await this.eventEmitter.emitAsync(AppEvents.USER_CHECK_EXISTS, { userId: ownerId });
        if (!userExist) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const skip = (page - 1) * limit;

        const ownerObjectId = new Types.ObjectId(ownerId);

        const totalPosts = await this.postModel.countDocuments({ userId: ownerObjectId, isHidden: { $ne: true } });

        const posts = await this.postModel
            .find({ userId: ownerObjectId, isHidden: { $ne: true } })
            .sort({ updatedAt: -1, caption: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'username fullName avatarUrl')
            .populate({
                path: 'urls',
                options: { sort: { order: 1 } }, // sort ảnh theo order
            })
            .lean()
            .exec();


        console.log('>>Post\n', posts);
        // lọc theo quyền riêng tư
        // nếu ownerId === viewerId thì ko cần lọc
        let filteredPosts = posts;
        if (ownerId !== effectiveViewerId) {
            filteredPosts = (
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
        }

        filteredPosts = filteredPosts.map((post: any) => {
            if (post && post.userId && typeof post.userId === 'object' && post.userId._id) {
                post.userId = {
                    userId: post.userId._id,
                    fullName: post.userId.fullName,
                    avatarUrl: post.userId.avatarUrl,
                    username: post.userId.username,
                };
            }
            return post;
        });

        console.log('>>Filtered Post\n', filteredPosts);
        const hasNext = skip + filteredPosts.length < totalPosts;

        // Lấy danh sách react của từng post thông qua event emitter
        const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_GET, { postIds: filteredPosts.map(p => p._id.toString()), viewerId: effectiveViewerId });
        const [reactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_FIND_BY_USER, { userId: ownerId, postIds: filteredPosts.map(p => p._id.toString()) });

        // Thêm thông tin react vào từng post
        const postsWithReacts = filteredPosts.map(post => ({
            ...post,
            reacts: reactsMap[post._id.toString()] || [],
            isReact: reactMap[post._id.toString()] || null
        }));

        return {
            data: postsWithReacts,
            page,
            limit,
            total: postsWithReacts.length,
            hasNext,
        };
    }

    async getAllPostsHomePage(viewerId: string, page: number = 1, limit: number = 5): Promise<PostListDto> {
        if (!Types.ObjectId.isValid(viewerId)) {
            throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
        }

        // Lấy danh sách bạn bè
        const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerId });
        const friendIds = friends.map((f) => f._id);

        const skip = (page - 1) * limit;

        // Query post của bạn bè
        let friendsPosts: PostDocument[] = await this.postModel
            .find({ userId: { $in: friendIds }, isHidden: { $ne: true } })
            .populate('userId', 'username fullName avatarUrl')
            .populate({ path: 'urls', options: { sort: { order: 1 } } })
            .sort({ createdAt: -1 })
            // .skip(skip)
            // .limit(limit)
            .lean()
            .exec();

        // lọc theo quyền riêng tư
        const filteredPosts: PostDocument[] = (
            await Promise.all(
                friendsPosts.map(async (post) => {
                    const canView = await this.canUserViewPost(
                        post._id.toString(),
                        viewerId,
                    );
                    return canView ? post : null;
                }),
            )
        ).filter((p) => p !== null);

        // query post của mình
        const myPosts: PostDocument[] = await this.postModel
            .find({ userId: new Types.ObjectId(viewerId), isHidden: { $ne: true } })
            .populate('userId', 'username fullName avatarUrl')
            .populate({ path: 'urls', options: { sort: { order: 1 } } })
            .sort({ createdAt: -1 })
            // .skip(skip)
            // .limit(limit)
            .lean()
            .exec();

        // Gộp tất cả posts và sắp xếp theo createdAt
        let allPosts: PostDocument[] = [...filteredPosts, ...myPosts];
        //     allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Nếu chưa đủ để fill trang hiện tại + check next page
        const neededCount = skip + limit + 1;
        if (allPosts.length < neededCount) {
            // Lấy các ID đã có để loại trừ
            const existingPostIds = allPosts.map(p => p._id.toString());
            const existingUserIds = [...friendIds.map(id => id.toString()), viewerId];

            // Bổ sung post public
            let publicPosts: PostDocument[] = await this.postModel
                .find({
                    privacy_type: PrivacyType.PUBLIC,
                    userId: { $nin: existingUserIds.map(id => new Types.ObjectId(id)) },
                    _id: { $nin: existingPostIds.map(id => new Types.ObjectId(id)) },
                    isHidden: { $ne: true }
                })
                .populate('userId', 'username fullName avatarUrl')
                .populate({ path: 'urls', options: { sort: { order: 1 } } })
                .sort({ createdAt: -1 })
                .lean()
                .exec();

            allPosts = [...allPosts, ...publicPosts];
            // Sắp xếp lại sau khi thêm public posts
            //    allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        // Lấy posts cho trang hiện tại (limit + 1 để check hasNext)
        const postsWithExtra = allPosts.slice(skip, skip + limit + 1);

        // hasNext = true nếu có nhiều hơn limit items
        const hasNext = postsWithExtra.length > limit;

        // Chỉ lấy đúng limit items để trả về
        const pageItems: PostResponseDto[] = postsWithExtra.slice(0, limit).map((post: any) => {
            if (post && post.userId && typeof post.userId === 'object' && post.userId._id) {
                post.userId = {
                    userId: post.userId._id,
                    fullName: post.userId.fullName,
                    avatarUrl: post.userId.avatarUrl,
                    username: post.userId.username,
                };
            }
            return post;
        });

        // Lấy danh sách react của từng post thông qua event emitter
        const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_GET, { postIds: pageItems.map(p => p._id.toString()), viewerId });
        const [reactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_FIND_BY_USER, { userId: viewerId, postIds: pageItems.map(p => p._id.toString()) });

        // Thêm thông tin react vào từng post
        const postsWithReacts: PostResponseDto[] = pageItems.map(post => ({
            ...post,
            reacts: reactsMap[post._id.toString()] || [],
            isReact: reactMap[post._id.toString()] || null
        }));

        // return {
        //     data: pageItems,
        //     page,
        //     limit,
        //     total: pageItems.length,
        //     hasNext,
        // };
        const result: PostListDto = {
            data: postsWithReacts,
            page,
            limit,
            total: postsWithReacts.length,
            hasNext,
        };

        return result;
    }

    async createPost(createPostDto: CreatePostDto, userId: string, files?: File[]): Promise<{ message: string }> {
        const { caption, titles = [], orders = [], layout, privacy_type, friends_except, friends_detail } = createPostDto;

        const post = await this.postModel.create({
            caption,
            userId: new Types.ObjectId(userId),
            layout,
            privacy_type,
            friends_except: friends_except ? friends_except.map(id => new Types.ObjectId(id)) : undefined,
            friends_detail: friends_detail ? friends_detail.map(id => new Types.ObjectId(id)) : undefined,
        });

        // let postUrls: PostUrlDocument[] = [];
        // if (urls && urls.length > 0) {
        //     postUrls = await this.postUrlModel.insertMany(
        //         urls.map((u, index) => ({
        //             url: u.url,
        //             title: u.title ?? '',
        //             order: u.order ?? index,
        //         })),

        //     );
        // }

        // // update post urls
        // post.urls = postUrls.map((url) => url._id as Types.ObjectId);
        // await post.save();
        if (files && files.length > 0) {

            const postId = post._id.toString();

            // Upload từng file lên Cloudinary trong folder riêng
            const uploadedUrls: any[] = [];

            const uploadResults = await Promise.all(
                files.map((file, index) => {
                    // Phân biệt hình ảnh và video
                    const isVideo = file.mimetype?.startsWith('video/');
                    const isImage = file.mimetype?.startsWith('image/');

                    // Định dạng cho phép
                    const allowedFormats = ['jpg', 'png', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv'];

                    // Cấu hình upload dựa trên loại file
                    const uploadOptions: any = {
                        folder: `uploads/${postId}`,
                        allowed_formats: allowedFormats,
                    };

                    if (isVideo) {
                        // Cấu hình cho video
                        uploadOptions.resource_type = 'video';
                        uploadOptions.transformation = [
                            {
                                width: 1920,
                                height: 1080,
                                crop: 'limit',
                                quality: 'auto',
                                fetch_format: 'auto'
                            }
                        ];
                    } else if (isImage) {
                        // Cấu hình cho hình ảnh
                        uploadOptions.resource_type = 'image';
                        uploadOptions.transformation = [
                            { width: 1080, height: 1080, crop: 'limit' }
                        ];
                    } else {
                        // Tự động phát hiện loại file
                        uploadOptions.resource_type = 'auto';
                    }

                    return cloudinary.uploader.upload(file.path, uploadOptions)
                        .then(result => ({
                            url: result.secure_url,
                            title: titles[index],
                            order: orders[index] ?? index,
                        }));
                })
            );

            uploadedUrls.push(...uploadResults);

            // Lưu URLs vào bảng post_urls
            const postUrls = await this.postUrlModel.insertMany(
                uploadedUrls.map((u, index) => ({
                    url: u.url,
                    title: u.title,
                    order: orders[index] ?? index,
                })),
            );

            // Gán vào post
            post.urls = postUrls.map((url) => url._id as Types.ObjectId);
            await post.save();
        }

        // return {
        //     ...post.toObject(),
        //     urls: postUrls,
        // };
        return {
            message: 'Đã tạo bài viết thành công',
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

        if (updatePostDto.layout) {
            post.layout = updatePostDto.layout;
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

        const post = await this.postModel.findById(postIdObject);
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }


        const setData: any = {
            privacy_type: updatePostPrivacyDto.privacy_type,
        };
        const unsetData: any = {};


        if (updatePostPrivacyDto.privacy_type === PrivacyType.FRIENDS_EXCEPT) {
            if (updatePostPrivacyDto.friends_except && updatePostPrivacyDto.friends_except.length > 0) {
                setData.friends_except = updatePostPrivacyDto.friends_except.map(id => new Types.ObjectId(id));
            } else {
                setData.friends_except = [];
            }

            unsetData.friends_detail = '';
        } else if (updatePostPrivacyDto.privacy_type === PrivacyType.FRIENDS_DETAIL) {
            if (updatePostPrivacyDto.friends_detail && updatePostPrivacyDto.friends_detail.length > 0) {
                setData.friends_detail = updatePostPrivacyDto.friends_detail.map(id => new Types.ObjectId(id));
            } else {
                setData.friends_detail = [];
            }

            unsetData.friends_except = '';
        } else {
            // Các privacy type khác, xóa cả hai
            unsetData.friends_except = '';
            unsetData.friends_detail = '';
        }


        const updateQuery: any = { $set: setData };
        if (Object.keys(unsetData).length > 0) {
            updateQuery.$unset = unsetData;
        }

        await this.postModel.updateOne({ _id: postIdObject }, updateQuery);
        const updatedPost = await this.postModel.findById(postIdObject);

        return updatedPost;
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

        const post = await this.postModel.findOne({ _id: postId, isHidden: { $ne: true } }).lean();
        if (!post) return false;

        // Lấy danh sách bạn bè của chủ post
        const [friendsOfOwner] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: post.userId.toString() });

        return PrivacyUtil.canView(
            new Types.ObjectId(viewerId),
            post,
            friendsOfOwner.map(f => new Types.ObjectId(f._id)),
        );
    }

    async reportPost(postId: string, userId: string, reportPostDto: ReportPostDto) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const postObjectId = new Types.ObjectId(postId);
        const userObjectId = new Types.ObjectId(userId);

        const post = await this.postModel.findById(postObjectId);
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        // Không cho phép tự báo cáo bài viết của mình (có thể bỏ check nếu muốn)
        if (post.userId.toString() === userId) {
            throw new HttpException('Bạn không thể báo cáo bài viết của chính mình', HttpStatus.BAD_REQUEST);
        }

        // Nếu đã tồn tại report của user này cho post này thì cập nhật lại lý do
        const existingReport = await this.postReportModel.findOne({
            postId: postObjectId,
            userId: userObjectId,
        });

        if (existingReport) {
            existingReport.reason = reportPostDto.reason;
            existingReport.description = reportPostDto.description;
            existingReport.status = 'pending';
            await existingReport.save();
        } else {
            await this.postReportModel.create({
                postId: postObjectId,
                userId: userObjectId,
                reason: reportPostDto.reason,
                description: reportPostDto.description,
            });
        }

        return {
            message: 'Báo cáo bài viết thành công. Cảm ơn bạn đã đóng góp giúp cộng đồng an toàn hơn.',
        };
    }

    @OnEvent(AppEvents.POST_GET_USER_ID)
    async handlePostGetUserId(payload: any) {
        const post = await this.postModel.findById(payload.postId).select('userId');
        if (!post) {
            return;
        }
        return post;
    }

}
