import { ForbiddenException, HttpException, HttpStatus, Injectable, Inject, forwardRef, Logger, BadRequestException } from '@nestjs/common';
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
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';
import { GoogleTranslationService } from 'src/shared/translation/google-translation.service';
import { File } from 'multer';
import * as fs from 'fs';
import { ImageModerationService } from '../../shared/services/image-moderation.service';
import { TextModerationService } from '../../shared/services/text-moderation.service';

@Injectable()
export class PostService {
    private readonly logger = new Logger(PostService.name);

    constructor(
        @InjectModel(Post.name) private postModel: Model<PostDocument>,
        @InjectModel(PostUrl.name) private postUrlModel: Model<PostUrlDocument>,
        @InjectModel(PostReport.name) private postReportModel: Model<PostReportDocument>,
        private readonly eventEmitter: EventEmitter2,
        @Inject(forwardRef(() => NotificationService))
        private readonly notificationService: NotificationService,
        private readonly imageModerationService: ImageModerationService,
        private readonly googleTranslationService: GoogleTranslationService,
        private readonly textModerationService: TextModerationService,
    ) { }

    async getPostDetail(postId: string, userId: string): Promise<PostResponseDto> {
        const canView = await this.canViewPost({ postId: postId.toString(), viewerId: userId.toString() });
        if (canView) {
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
        return null as unknown as PostResponseDto;
    }

    async getAllPostsByUser(ownerId: string, viewerId: string, page: number = 1, limit: number = 5) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
        }

        // nếu là admin thì ko cần check privacy
        if (Types.ObjectId.isValid(viewerId)) {
            const [isAdmin] = await this.eventEmitter.emitAsync(AppEvents.USER_IS_ADMIN, { userId: viewerId });
            if (isAdmin) {
                viewerId = ownerId;
            }
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

        // Random shuffle array sử dụng Fisher-Yates algorithm
        for (let i = allPosts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPosts[i], allPosts[j]] = [allPosts[j], allPosts[i]];
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
        const { caption, titles = [], orders = [], layout, privacy_type, friends_except, friends_detail, communityId } = createPostDto;

        // Kiểm duyệt nội dung caption trước
        if (caption && caption.trim().length > 0) {
            const textResult = await this.textModerationService.checkText(caption);
            if (!textResult.is_safe) {
                // Xóa file tạm nếu có
                if (files && files.length > 0) {
                    this.cleanupTempFiles(files);
                }
                throw new BadRequestException(
                    'Nội dung bài viết vi phạm tiêu chuẩn cộng đồng! Vui lòng chỉnh sửa nội dung.',
                );
            }
        }

        // Kiểm duyệt hình ảnh trước khi upload
        if (files && files.length > 0) {
            const moderationResults = await this.imageModerationService.checkImages(files);
            const violatedImage = moderationResults.find(r => !r.is_safe);

            if (violatedImage) {
                // Xóa tất cả file tạm trên disk
                this.cleanupTempFiles(files);
                throw new BadRequestException(
                    `Hình ảnh vi phạm tiêu chuẩn cộng đồng! Vui lòng chọn hình ảnh khác.`,
                );
            }
        }

        // Tạo post trong database
        const post = await this.postModel.create({
            caption,
            userId: new Types.ObjectId(userId),
            layout,
            privacy_type,
            friends_except: friends_except ? friends_except.map(id => new Types.ObjectId(id)) : undefined,
            friends_detail: friends_detail ? friends_detail.map(id => new Types.ObjectId(id)) : undefined,
            // Nếu có communityId thì set trạng thái pending cần duyệt
            ...(communityId ? {
                communityId: new Types.ObjectId(communityId),
                communityStatus: 'pending',
            } : {}),
        });

        // Upload file từ disk lên Cloudinary
        if (files && files.length > 0) {
            try {
                const postId = post._id.toString();
                const uploadedUrls: any[] = [];

                const uploadResults = await Promise.all(
                    files.map((file, index) => {
                        const isVideo = file.mimetype?.startsWith('video/');
                        const isImage = file.mimetype?.startsWith('image/');

                        const allowedFormats = ['jpg', 'png', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv'];

                        const uploadOptions: any = {
                            folder: `uploads/${postId}`,
                            allowed_formats: allowedFormats,
                        };

                        if (isVideo) {
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
                            uploadOptions.resource_type = 'image';
                            uploadOptions.transformation = [
                                { width: 1080, height: 1080, crop: 'limit' }
                            ];
                        } else {
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
            } finally {
                // Luôn xóa file tạm sau khi upload xong (dù thành công hay thất bại)
                this.cleanupTempFiles(files);
            }
        }

        return {
            message: 'Đã tạo bài viết thành công',
        };
    }

    // Xóa các file tạm trên disk sau khi xử lý xong     
    private cleanupTempFiles(files: File[]): void {
        for (const file of files) {
            try {
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                    this.logger.debug(`Đã xóa file tạm: ${file.path}`);
                }
            } catch (error) {
                this.logger.warn(`Không thể xóa file tạm ${file.path}: ${error.message}`);
            }
        }
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
            // Kiểm tra nội dung vi phạm
            const textResult = await this.textModerationService.checkText(updatePostDto.caption);

            if (!textResult.is_safe) {
                throw new BadRequestException(
                    'Nội dung bài viết vi phạm tiêu chuẩn cộng đồng! Vui lòng chỉnh sửa nội dung.',
                );
            }

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

        // Nếu có >= 100 báo cáo pending thì tự động ẩn bài viết
        const pendingReportsCount = await this.postReportModel.countDocuments({
            postId: postObjectId,
            status: 'pending',
        });

        if (pendingReportsCount >= 100 && !post.isHidden) {
            post.isHidden = true;
            await post.save();
        }

        return {
            message: 'Báo cáo bài viết thành công. Cảm ơn bạn đã đóng góp giúp cộng đồng an toàn hơn.',
        };
    }

    async translateCaption(postId: string, targetLang: string = 'vi') {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const postObjectId = new Types.ObjectId(postId);
        const post = await this.postModel.findById(postObjectId).select('caption').lean();

        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        const caption: string | undefined = (post as any).caption;

        if (!caption || !caption.trim()) {
            throw new HttpException('Post has no caption', HttpStatus.BAD_REQUEST);
        }

        try {
            const result = await this.googleTranslationService.translate(caption, targetLang);

            return {
                originalCaption: caption,
                translatedCaption: result.translatedText,
                sourceLang: result.sourceLang,
                targetLang: result.targetLang,
            };
        } catch (error) {
            this.logger.error(
                `Failed to translate caption for post ${postId}`,
                error as any,
            );
            throw new HttpException(
                'Failed to translate caption',
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    @OnEvent(AppEvents.POST_GET_USER_ID)
    async handlePostGetUserId(payload: any) {
        const post = await this.postModel.findById(payload.postId).select('userId');
        if (!post) {
            return;
        }
        return post;
    }

    @OnEvent(AppEvents.POST_GET_ALL_BY_USER)
    async handleGetAllPostsByUser(payload: { ownerId: string, viewerId: string, page?: number, limit?: number }) {
        const { ownerId, viewerId, page = 1, limit = 5 } = payload;
        return await this.getAllPostsByUser(ownerId, viewerId, page, limit);
    }

    @OnEvent(AppEvents.POST_GET_DETAIL)
    async handleGetPostDetail(payload: { postId: string, userId: string }) {
        const { postId, userId } = payload;
        return await this.getPostDetail(postId, userId);
    }

    // ===== ADMIN EVENT LISTENERS =====
    @OnEvent(AppEvents.ADMIN_POST_GET_ALL)
    async handleAdminGetAllPosts(payload: {
        page?: number;
        limit?: number;
        search?: string;
    }) {
        const { page = 1, limit = 10, search } = payload;
        const skip = (page - 1) * limit;
        const query: any = {};

        if (search && search.trim()) {
            query.caption = { $regex: search.trim(), $options: 'i' };
        }

        const [posts, total] = await Promise.all([
            this.postModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username fullName avatarUrl')
                .populate({ path: 'urls', options: { sort: { order: 1 } } })
                .lean()
                .exec(),
            this.postModel.countDocuments(query).exec(),
        ]);

        const postResponseDtos = await Promise.all(
            posts.map(async (post: any) => {
                const userResponseDto: any = plainToInstance(
                    UserResponseDto,
                    post.userId,
                    {
                        excludeExtraneousValues: true,
                    },
                );
                const cleanedUser = omitBy(
                    userResponseDto,
                    isUndefined,
                ) as UserResponseDto;

                const [reactsMap] = await this.eventEmitter.emitAsync(
                    AppEvents.REACT_POST_GET,
                    {
                        postIds: [post._id.toString()],
                        viewerId: post.userId._id.toString(),
                    },
                );

                const [commentsResult] = await this.eventEmitter.emitAsync(
                    AppEvents.COMMENT_FIND_BY_POST_ID,
                    { postId: post._id.toString() },
                );
                const comments = commentsResult || [];

                return {
                    ...post,
                    userId: cleanedUser,
                    reacts: reactsMap[post._id.toString()] || [],
                    isReact: null,
                    comments: comments || [],
                } as any;
            }),
        );

        return {
            data: postResponseDtos,
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

    @OnEvent(AppEvents.ADMIN_POST_DELETE)
    async handleAdminDeletePost({ postId }: { postId: string }) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const post = await this.postModel.findById(postId).exec();
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        await post.deleteOne();

        return { message: 'Post deleted successfully' };
    }

    @OnEvent(AppEvents.ADMIN_POST_HIDE)
    async handleAdminHidePost({ postId }: { postId: string }) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const post = await this.postModel.findById(postId).exec();
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        post.isHidden = true;
        await post.save();

        return { message: 'Post hidden successfully' };
    }

    @OnEvent(AppEvents.ADMIN_POST_UNHIDE)
    async handleAdminUnhidePost({ postId }: { postId: string }) {
        if (!Types.ObjectId.isValid(postId)) {
            throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
        }

        const post = await this.postModel.findById(postId).exec();
        if (!post) {
            throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
        }

        post.isHidden = false;
        await post.save();

        return { message: 'Post unhidden successfully' };
    }

    @OnEvent(AppEvents.ADMIN_POSTS_STATS)
    async handleAdminPostsStats(payload: {
        groupBy?: 'day' | 'month';
        days?: number;
    }) {
        const { groupBy = 'day', days = 30 } = payload;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const format = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';

        const posts = await this.postModel
            .aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: startDate,
                            $lte: endDate,
                        },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format,
                                date: '$createdAt',
                            },
                        },
                        count: { $sum: 1 },
                    },
                },
                {
                    $sort: { _id: 1 },
                },
                {
                    $project: {
                        date: '$_id',
                        count: 1,
                        _id: 0,
                    },
                },
            ])
            .exec();

        return posts;
    }

    // ===== ADMIN POST REPORT EVENT LISTENERS =====
    @OnEvent(AppEvents.ADMIN_POST_REPORT_GET_ALL)
    async handleAdminGetPostReports(payload: {
        page?: number;
        limit?: number;
        status?: 'pending' | 'reviewed' | 'rejected';
    }) {
        const { page = 1, limit = 10, status } = payload;
        const skip = (page - 1) * limit;
        const matchQuery: any = {};

        if (status) {
            matchQuery.status = status;
        }

        const pipeline: any[] = [
            {
                $match: matchQuery,
            },
            {
                $lookup: {
                    from: 'posts',
                    localField: 'postId',
                    foreignField: '_id',
                    as: 'postInfo',
                },
            },
            {
                $unwind: {
                    path: '$postInfo',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'postInfo.userId',
                    foreignField: '_id',
                    as: 'postOwner',
                },
            },
            {
                $unwind: {
                    path: '$postOwner',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'reporterInfo',
                },
            },
            {
                $unwind: {
                    path: '$reporterInfo',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $group: {
                    _id: '$postId',
                    postId: {
                        $first: {
                            _id: '$postInfo._id',
                            caption: '$postInfo.caption',
                            userId: '$postInfo.userId',
                            urls: '$postInfo.urls',
                            layout: '$postInfo.layout',
                            privacy_type: '$postInfo.privacy_type',
                            isHidden: '$postInfo.isHidden',
                            createdAt: '$postInfo.createdAt',
                            updatedAt: '$postInfo.updatedAt',
                        }
                    },
                    postOwner: { $first: '$postOwner' },
                    reporters: {
                        $push: {
                            _id: '$_id',
                            userId: {
                                _id: '$reporterInfo._id',
                                fullName: '$reporterInfo.fullName',
                                username: '$reporterInfo.username',
                                avatarUrl: '$reporterInfo.avatarUrl',
                                email: '$reporterInfo.email',
                            },
                            reason: '$reason',
                            description: '$description',
                            status: '$status',
                            createdAt: '$createdAt',
                            updatedAt: '$updatedAt',
                        },
                    },
                    totalReports: { $sum: 1 },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
                    },
                    reviewedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] },
                    },
                    rejectedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
                    },
                    latestReportDate: { $max: '$createdAt' },
                },
            },
            {
                $lookup: {
                    from: 'posturls',
                    let: { urlIds: '$postId.urls' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ['$_id', '$$urlIds'],
                                },
                            },
                        },
                        {
                            $sort: { order: 1 },
                        },
                    ],
                    as: 'postUrls',
                },
            },
            {
                $addFields: {
                    'postId.urls': '$postUrls',
                },
            },
            {
                $sort: { latestReportDate: -1 },
            },
            {
                $skip: skip,
            },
            {
                $limit: limit,
            },
        ];

        const countPipeline = [
            {
                $match: matchQuery,
            },
            {
                $group: {
                    _id: '$postId',
                },
            },
            {
                $count: 'total',
            },
        ];

        const [groupedReports, countResult] = await Promise.all([
            this.postReportModel.aggregate(pipeline).exec(),
            this.postReportModel.aggregate(countPipeline).exec(),
        ]);

        const total = countResult.length > 0 ? countResult[0].total : 0;

        const formattedData = groupedReports.map((item: any) => {
            const postId = item.postId?._id || item._id;
            return {
                postId: {
                    ...item.postId,
                    userId: item.postOwner,
                    urls: item.postUrls || [],
                },
                reporters: item.reporters || [],
                reportCounts: {
                    total: item.totalReports,
                    pending: item.pendingCount,
                    reviewed: item.reviewedCount,
                    rejected: item.rejectedCount,
                },
                latestReportDate: item.latestReportDate,
            };
        });

        return {
            data: formattedData,
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

    @OnEvent(AppEvents.ADMIN_POST_REPORT_GET_BY_ID)
    async handleAdminGetPostReportById({ reportId }: { reportId: string }) {
        if (!Types.ObjectId.isValid(reportId)) {
            throw new HttpException('Invalid reportId', HttpStatus.BAD_REQUEST);
        }

        const report = await this.postReportModel
            .findById(reportId)
            .populate({
                path: 'postId',
                populate: [
                    {
                        path: 'userId',
                        select: 'username fullName avatarUrl',
                    },
                    {
                        path: 'urls',
                        options: { sort: { order: 1 } },
                    },
                ],
            })
            .populate('userId', 'username fullName email avatarUrl')
            .lean()
            .exec();

        if (!report) {
            throw new HttpException('Post report not found', HttpStatus.NOT_FOUND);
        }

        return report;
    }

    @OnEvent(AppEvents.ADMIN_POST_REPORT_UPDATE_STATUS)
    async handleAdminUpdatePostReportStatus(payload: {
        reportId: string;
        status: 'pending' | 'reviewed' | 'rejected';
        note?: string;
    }) {
        const { reportId, status, note } = payload;
        if (!Types.ObjectId.isValid(reportId)) {
            throw new HttpException('Invalid reportId', HttpStatus.BAD_REQUEST);
        }

        const report = await this.postReportModel.findById(reportId).exec();
        if (!report) {
            throw new HttpException('Post report not found', HttpStatus.NOT_FOUND);
        }

        report.status = status;
        await report.save();

        const post = await this.postModel.findById(report.postId).populate('userId', 'username fullName avatarUrl').exec();
        if (post) {
            if (status === 'reviewed') {
                post.isHidden = true;
                await post.save();
            } else if (status === 'rejected') {
                post.isHidden = false;
                await post.save();
            }

            // Gửi thông báo đến người sở hữu bài viết khi admin xử lý báo cáo
            if (status === 'reviewed') {
                const postOwnerId = (post.userId as any)?._id?.toString() || (post.userId as any)?.toString();

                if (postOwnerId) {
                    try {

                        // Lấy caption của bài viết, truncate nếu quá dài
                        const postCaption = post.caption || '';
                        const truncatedCaption = postCaption.length > 50
                            ? postCaption.substring(0, 50) + '...'
                            : postCaption;

                        // Tạo message với tên bài viết
                        const postTitle = truncatedCaption || 'bài viết của bạn';
                        const message = `Báo cáo về "${postTitle}" đã bị ẩn do vi phạm tiêu chuẩn cộng đồng`;

                        // Gửi thông báo trong ứng dụng
                        await this.notificationService.createAndEmit({
                            receiver: postOwnerId,
                            sender: undefined, // Admin không có sender
                            type: NotificationType.POST_REPORT_REVIEWED,
                            targetId: post._id.toString(),
                            message: message,
                            content: note || undefined,
                        });
                    } catch (error) {
                        this.logger.error(`Failed to send notification for post report ${reportId}:`, error);
                    }
                }
            }
        }

        return {
            message: 'Post report status updated successfully',
            status: report.status,
        };
    }

    @OnEvent(AppEvents.ADMIN_POST_REPORT_BULK_UPDATE_STATUS)
    async handleAdminBulkUpdatePostReportStatus(payload: {
        reportIds: string[];
        status: 'pending' | 'reviewed' | 'rejected';
        note?: string;
    }) {
        const { reportIds, status, note } = payload;
        const validReportIds = reportIds.filter((id) => Types.ObjectId.isValid(id));
        if (validReportIds.length === 0) {
            throw new HttpException('No valid report IDs provided', HttpStatus.BAD_REQUEST);
        }

        const objectIds = validReportIds.map((id) => new Types.ObjectId(id));

        const updateResult = await this.postReportModel.updateMany(
            { _id: { $in: objectIds } },
            { status },
        );

        if (updateResult.matchedCount === 0) {
            throw new HttpException('No reports found', HttpStatus.NOT_FOUND);
        }

        const reports = await this.postReportModel
            .find({ _id: { $in: objectIds } })
            .select('postId')
            .lean()
            .exec();

        const uniquePostIds = [...new Set(reports.map((r) => r.postId.toString()))];

        if (status === 'reviewed') {
            await this.postModel.updateMany(
                { _id: { $in: uniquePostIds.map((id) => new Types.ObjectId(id)) } },
                { isHidden: true },
            );
        } else if (status === 'rejected') {
            for (const postId of uniquePostIds) {
                const allReportsForPost = await this.postReportModel
                    .find({ postId: new Types.ObjectId(postId) })
                    .lean()
                    .exec();

                const allRejected = allReportsForPost.every((r) => r.status === 'rejected');
                if (allRejected) {
                    await this.postModel.findByIdAndUpdate(postId, { isHidden: false });
                }
            }
        }

        // Gửi thông báo đến người sở hữu bài viết khi admin xử lý báo cáo (bulk)
        if (status === 'reviewed') {
            const posts = await this.postModel
                .find({ _id: { $in: uniquePostIds.map((id) => new Types.ObjectId(id)) } })
                .populate('userId', 'username fullName avatarUrl')
                .exec();

            // Gửi thông báo cho từng bài viết (tránh gửi trùng cho cùng một user)
            const notifiedUsers = new Set<string>();

            for (const post of posts) {
                const postOwnerId = (post.userId as any)?._id?.toString() || (post.userId as any)?.toString();

                if (postOwnerId) {
                    try {
                        // Lấy caption của bài viết, truncate nếu quá dài
                        const postCaption = post.caption || '';
                        const truncatedCaption = postCaption.length > 50
                            ? postCaption.substring(0, 50) + '...'
                            : postCaption;

                        // Tạo message với tên bài viết
                        const postTitle = truncatedCaption || 'bài viết của bạn';
                        const message = `Báo cáo về "${postTitle}" đã bị ẩn do vi phạm tiêu chuẩn cộng đồng`;

                        // Gửi thông báo trong ứng dụng (gửi riêng cho từng bài viết)
                        await this.notificationService.createAndEmit({
                            receiver: postOwnerId,
                            sender: undefined, // Admin không có sender
                            type: NotificationType.POST_REPORT_REVIEWED,
                            targetId: post._id.toString(),
                            message: message,
                            content: note || undefined,
                        });
                    } catch (error) {
                        this.logger.error(`Failed to send notification for bulk post report update:`, error);
                    }
                }
            }
        }

        return {
            message: `Successfully updated ${updateResult.modifiedCount} report(s)`,
            updatedCount: updateResult.modifiedCount,
            matchedCount: updateResult.matchedCount,
        };
    }

    @OnEvent(AppEvents.ADMIN_DASHBOARD_STATS)
    async handleAdminDashboardStats() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalPosts, newPostsThisMonth] = await Promise.all([
            this.postModel.countDocuments().exec(),
            this.postModel
                .countDocuments({ createdAt: { $gte: startOfMonth } })
                .exec(),
        ]);

        return {
            totalPosts,
            newPostsThisMonth,
        };
    }

    @OnEvent(AppEvents.POST_CAN_VIEW)
    async canViewPost(payload: any): Promise<boolean> {
        const post = await this.postModel.findById(payload.postId).lean();
        if (!post) return false;
        // kiểm tra có phải admin không
        const [isAdmin] = await this.eventEmitter.emitAsync(AppEvents.USER_IS_ADMIN, { userId: payload.viewerId });
        if (isAdmin) return true;
        if (post.privacy_type === PrivacyType.PUBLIC) return true;
        if (post.privacy_type === PrivacyType.PRIVATE) {
            return post.userId.toString() === payload.viewerId;
        }
        if (post.privacy_type === PrivacyType.FRIENDS) {
            const [friendsOfOwner] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: post.userId.toString() });
            const isFriend = friendsOfOwner.some((f: any) => f._id.toString() === payload.viewerId);
            if (isFriend) return true;
        }
        if (post.privacy_type === PrivacyType.FRIENDS_EXCEPT) {
            if (post.friends_except && post.friends_except.length > 0) {
                const isExcepted = post.friends_except.some((id: Types.ObjectId) => id.toString() === payload.viewerId);
                if (isExcepted) return false;
            }
            return true;
        }
        if (post.privacy_type === PrivacyType.FRIENDS_DETAIL) {
            if (post.friends_detail && post.friends_detail.length > 0) {
                const isAllowed = post.friends_detail.some((id: Types.ObjectId) => id.toString() === payload.viewerId);
                return isAllowed;
            }
            return false;
        }
        return false;
    }

    // ===== COMMUNITY EVENT LISTENERS =====

    @OnEvent(AppEvents.COMMUNITY_GET_APPROVED_POSTS)
    async handleGetCommunityApprovedPosts(payload: {
        communityId: string;
        userId: string;
        page: number;
        limit: number;
    }) {
        const { communityId, userId, page = 1, limit = 10 } = payload;
        const skip = (page - 1) * limit;
        const communityObjectId = new Types.ObjectId(communityId);

        const [posts, total] = await Promise.all([
            this.postModel
                .find({ communityId: communityObjectId, communityStatus: 'approved', isHidden: { $ne: true } })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username fullName avatarUrl')
                .populate({ path: 'urls', options: { sort: { order: 1 } } })
                .lean()
                .exec(),
            this.postModel.countDocuments({ communityId: communityObjectId, communityStatus: 'approved', isHidden: { $ne: true } }),
        ]);

        // Lấy react info
        const postIds = posts.map((p: any) => p._id.toString());
        const [reactsMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_GET, { postIds, viewerId: userId });
        const [reactMap] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_FIND_BY_USER, { userId, postIds });

        const postsWithReacts = posts.map((post: any) => ({
            ...post,
            reacts: reactsMap?.[post._id.toString()] || [],
            isReact: reactMap?.[post._id.toString()] || null,
        }));

        return {
            data: postsWithReacts,
            page,
            limit,
            total,
            hasNext: skip + posts.length < total,
        };
    }

    @OnEvent(AppEvents.COMMUNITY_GET_PENDING_POSTS)
    async handleGetCommunityPendingPosts(payload: {
        communityId: string;
        page: number;
        limit: number;
    }) {
        const { communityId, page = 1, limit = 10 } = payload;
        const skip = (page - 1) * limit;
        const communityObjectId = new Types.ObjectId(communityId);

        const [posts, total] = await Promise.all([
            this.postModel
                .find({ communityId: communityObjectId, communityStatus: 'pending' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username fullName avatarUrl')
                .populate({ path: 'urls', options: { sort: { order: 1 } } })
                .lean()
                .exec(),
            this.postModel.countDocuments({ communityId: communityObjectId, communityStatus: 'pending' }),
        ]);

        return {
            data: posts,
            page,
            limit,
            total,
            hasNext: skip + posts.length < total,
        };
    }

    @OnEvent('community.post.updateStatus')
    async handleCommunityPostUpdateStatus(payload: {
        postId: string;
        communityId: string;
        status: string;
    }) {
        const { postId, communityId, status } = payload;
        const post = await this.postModel.findOne({
            _id: new Types.ObjectId(postId),
            communityId: new Types.ObjectId(communityId),
        });
        if (!post) return null;

        post.communityStatus = status as any;
        await post.save();

        return { userId: post.userId };
    }
}
