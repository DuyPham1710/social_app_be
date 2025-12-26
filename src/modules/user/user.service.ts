import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchHistory, SearchHistoryDocument } from './schemas/search-history.schema';
import { Model, Types } from 'mongoose';
import UserResponseDto from './dto/user.response.dto';
import { SearchHistoryResponseDto } from './dto/search-history-response.dto';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import UpdateUserDto from './dto/update.user.dto';
// import { FriendsService } from '../friends/friends.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(SearchHistory.name) private readonly searchHistoryModel: Model<SearchHistoryDocument>,
        //  private readonly friendsService: FriendsService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    async findAll(): Promise<UserResponseDto[]> {
        const users = await this.userModel.find().exec();
        return plainToInstance(UserResponseDto, users, {
            excludeExtraneousValues: true
        });
    }

    async findByEmail(email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).exec();
    }

    async findByUsername(username: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ username }).exec();
    }

    async findOne(userId: string): Promise<UserResponseDto> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException(`Invalid userId: ${userId}`, HttpStatus.BAD_REQUEST);
        }

        const user = await this.userModel.findById(userId).exec();

        if (!user) {
            throw new HttpException(`User with ID ${userId} not found`, HttpStatus.NOT_FOUND);
        }
        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async getBasicUserInfo(userId: string): Promise<{ userId: string; username: string; fullName: string; avatarUrl?: string } | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }

        const user = await this.userModel
            .findById(userId)
            .select('username fullName avatarUrl')
            .lean()
            .exec();

        if (!user) {
            return null;
        }

        return {
            userId: (user as any)._id.toString(),
            username: user.username,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
        };
    }

    async checkUserExist(userId: string): Promise<boolean> {
        const user = await this.userModel.exists({ _id: userId }).exec();
        return !!user;
    }

    async create(data: Partial<User>): Promise<UserDocument> {
        const newUser = new this.userModel(data);
        return newUser.save();
    }

    async validateUserByEmail(email: string, password: string): Promise<UserResponseDto> {
        const user = await this.findByEmail(email);

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const auth = await bcrypt.compare(password, user.password);

        if (!auth) {
            throw new UnauthorizedException('Invalid password');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Your account is not activated. Please verify your email to activate your account');
        }

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async updateRefreshToken(userId: string, refreshToken: string) {
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await this.userModel.findByIdAndUpdate(
            userId,
            { refreshToken: hashedRefreshToken },
            { new: true } // trả về user đã cập nhật 
        );
    }

    async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        await this.userModel.findByIdAndUpdate(
            userId,
            { fcmToken },
            { new: true }
        );
    }

    async getFcmToken(userId: string): Promise<string | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }

        const user = await this.userModel
            .findById(userId)
            .select('fcmToken')
            .lean()
            .exec();

        return user?.fcmToken || null;
    }

    async update(userId: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }
        const userIdObject = new Types.ObjectId(userId);


        await this.userModel.findByIdAndUpdate(userIdObject, updateUserDto, { new: true });

        const user = await this.userModel.findById(userIdObject).exec();

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        });
    }

    async searchUser(query: string, page: number, limit: number, userId: string, saveToHistory: boolean = true) {
        const skip = (page - 1) * limit;
        const qRegex = { $regex: query, $options: 'i' };

        const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId });
        const friendIds = friends.map(friend => friend._id);

        // Tìm bạn bè trực tiếp phù hợp query
        const friendsMatched = await this.userModel.find({
            _id: { $in: friendIds },
            role: { $ne: 'admin' },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Tìm mutual friends (friends-of-friends) match query
        const mutualFriendsArrays = await Promise.all(
            friendIds.map(friendId => this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: friendId.toString() }).then(([res]) => res))
        );
        // mutualFriendsArrays bây giờ là 1 mảng 2 chiều: [ [friendA1, friendA2], [friendB1, friendB2], ... ]
        // Gộp tất cả lại
        const mutualFriends = mutualFriendsArrays.flat();
        // Loại bỏ chính user và bạn bè trực tiếp, và loại bỏ duplicate bằng Set
        const mutualIdsSet = new Set<string>();
        mutualFriends.forEach(f => {
            const id = f._id.toString();
            if (id !== userId && !friendIds.some(fid => fid.toString() === id)) {
                mutualIdsSet.add(id);
            }
        });
        const mutualIds = Array.from(mutualIdsSet);

        // Tìm mutual friends phù hợp query
        const mutualMatched = await this.userModel.find({
            _id: { $in: mutualIds },
            role: { $ne: 'admin' },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Tìm tất cả user khác phù hợp query (ngoại trừ chính mình và bạn bè đã có)
        const otherMatched = await this.userModel.find({
            _id: { $nin: [userId, ...friendIds, ...mutualIds] },
            role: { $ne: 'admin' },
            $or: [
                { username: qRegex },
                { fullName: qRegex }
            ]
        });

        // Gộp lại theo thứ tự ưu tiên: bạn bè → mutual → người khác
        // Sử dụng Set và Map để loại bỏ duplicate dựa trên _id
        const addedUserIds = new Set<string>();
        const combinedResults: UserDocument[] = [];

        // Thêm bạn bè trực tiếp (ưu tiên cao nhất)
        for (const user of friendsMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }

        // Thêm mutual friends (chỉ nếu chưa có)
        for (const user of mutualMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }

        // Thêm người khác (chỉ nếu chưa có)
        for (const user of otherMatched) {
            const userId = (user as any)._id.toString();
            if (!addedUserIds.has(userId)) {
                addedUserIds.add(userId);
                combinedResults.push(user);
            }
        }

        const totalItems = combinedResults.length;
        const totalPages = Math.ceil(totalItems / limit);
        const paginated = combinedResults.slice(skip, skip + limit);

        const userResponseDtos: UserResponseDto[] = paginated.map(user => plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true
        }));

        // Lưu lịch sử tìm kiếm (chỉ lưu khi có kết quả, query không rỗng và saveToHistory = true)
        if (query.trim().length > 0 && saveToHistory) {
            this.saveSearchHistory(userId, query, totalItems).catch(err => {
                // Log error nhưng không throw để không ảnh hưởng đến response
                console.error('Error saving search history:', err);
            });
        }

        return {
            userResponseDtos,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        };
    }

    async saveSearchHistory(userId: string, query: string, resultCount: number): Promise<SearchHistoryDocument> {
        // Kiểm tra xem đã có lịch sử tìm kiếm gần đây với query này chưa (trong vòng 1 giờ)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const existingHistory = await this.searchHistoryModel.findOne({
            userId: new Types.ObjectId(userId),
            query: query.trim(),
            createdAt: { $gte: oneHourAgo }
        }).exec();

        if (existingHistory) {
            // Cập nhật lịch sử hiện có
            existingHistory.resultCount = resultCount;
            (existingHistory as any).createdAt = new Date();
            return existingHistory.save();
        }

        // Tạo lịch sử mới
        const searchHistory = new this.searchHistoryModel({
            userId: new Types.ObjectId(userId),
            query: query.trim(),
            resultCount: resultCount
        });

        return searchHistory.save();
    }

    async saveViewedUser(userId: string, viewedUserId: string): Promise<SearchHistoryDocument> {
        // Kiểm tra xem đã có lịch sử xem user này gần đây chưa (trong vòng 1 giờ)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const existingHistory = await this.searchHistoryModel.findOne({
            userId: new Types.ObjectId(userId),
            viewedUserId: new Types.ObjectId(viewedUserId),
            createdAt: { $gte: oneHourAgo }
        }).exec();

        if (existingHistory) {
            // Cập nhật thời gian xem
            (existingHistory as any).createdAt = new Date();
            return existingHistory.save();
        }

        // Tạo lịch sử mới
        const searchHistory = new this.searchHistoryModel({
            userId: new Types.ObjectId(userId),
            viewedUserId: new Types.ObjectId(viewedUserId)
        });

        return searchHistory.save();
    }

    async getSearchHistory(userId: string, limit: number = 10): Promise<SearchHistoryResponseDto[]> {
        const histories = await this.searchHistoryModel
            .find({ userId: new Types.ObjectId(userId) })
            .populate('viewedUserId', '_id fullName username avatarUrl email')
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();

        const result = histories.map(history => {
            // Sử dụng toObject() để lấy plain object với tất cả fields bao gồm createdAt và updatedAt
            const historyObj = history.toObject() as any;
            const dto: any = {
                _id: historyObj._id ? (typeof historyObj._id === 'string' ? historyObj._id : historyObj._id.toString()) : historyObj._id,
                query: historyObj.query,
                resultCount: historyObj.resultCount,
                createdAt: historyObj.createdAt,
                updatedAt: historyObj.updatedAt,
            };

            // Nếu có viewedUserId và đã populate, thêm thông tin user
            if (historyObj.viewedUserId && typeof historyObj.viewedUserId === 'object') {
                const viewedUser = historyObj.viewedUserId as any;
                // Đảm bảo _id được include và convert thành string
                const userId = viewedUser._id ? (typeof viewedUser._id === 'string' ? viewedUser._id : viewedUser._id.toString()) : (viewedUser.id ? (typeof viewedUser.id === 'string' ? viewedUser.id : viewedUser.id.toString()) : null);

                // Nếu không có _id, bỏ qua user này
                if (!userId) {
                    dto.viewedUser = undefined;
                } else {
                    // Tạo userData với _id để transform hoạt động
                    const userData = {
                        ...viewedUser,
                        _id: userId,
                    };
                    const transformedUser = plainToInstance(UserResponseDto, userData, {
                        excludeExtraneousValues: true
                    });

                    // Đảm bảo userId được set (transform có thể không hoạt động khi serialize lại)
                    transformedUser.userId = userId;

                    // Tạo plain object với tất cả fields bao gồm userId để đảm bảo có trong response
                    const userPlain: any = {
                        userId: userId,
                        fullName: transformedUser.fullName,
                        email: transformedUser.email,
                        username: transformedUser.username,
                    };

                    // Thêm các fields optional nếu có
                    if (transformedUser.phoneNumber) userPlain.phoneNumber = transformedUser.phoneNumber;
                    if (transformedUser.bio) userPlain.bio = transformedUser.bio;
                    if (transformedUser.avatarUrl) userPlain.avatarUrl = transformedUser.avatarUrl;
                    if (transformedUser.dateOfBirth) userPlain.dateOfBirth = transformedUser.dateOfBirth;
                    if (transformedUser.gender) userPlain.gender = transformedUser.gender;
                    if (transformedUser.isActive !== undefined) userPlain.isActive = transformedUser.isActive;
                    if (transformedUser.createdAt) userPlain.createdAt = transformedUser.createdAt;
                    if (transformedUser.role) userPlain.role = transformedUser.role;

                    // Transform lại từ plain object với userId đã được set
                    dto.viewedUser = plainToInstance(UserResponseDto, userPlain, {
                        excludeExtraneousValues: true
                    });

                    // Đảm bảo userId được set sau khi transform
                    if (dto.viewedUser) {
                        dto.viewedUser.userId = userId;
                    }
                }
            }

            const finalDto = plainToInstance(SearchHistoryResponseDto, dto, {
                excludeExtraneousValues: true
            });

            // Đảm bảo userId được set trong viewedUser sau khi serialize lại
            if (finalDto.viewedUser && historyObj.viewedUserId) {
                const viewedUser = historyObj.viewedUserId as any;
                const userId = viewedUser._id ? (typeof viewedUser._id === 'string' ? viewedUser._id : viewedUser._id.toString()) : null;
                if (userId) {
                    // Set trực tiếp vào instance để đảm bảo có trong response
                    (finalDto.viewedUser as any).userId = userId;
                }
            }
            return finalDto;
        });

        return result;
    }

    async deleteSearchHistory(userId: string, historyId?: string): Promise<void> {
        if (historyId) {
            // Xóa một lịch sử cụ thể
            const result = await this.searchHistoryModel.deleteOne({
                _id: new Types.ObjectId(historyId),
                userId: new Types.ObjectId(userId)
            }).exec();

            if (result.deletedCount === 0) {
                throw new HttpException('Search history not found', HttpStatus.NOT_FOUND);
            }
        } else {
            // Xóa tất cả lịch sử của user
            await this.searchHistoryModel.deleteMany({
                userId: new Types.ObjectId(userId)
            }).exec();
        }
    }

    // ===== EVENT LISTENERS FOR AUTH =====
    @OnEvent(AppEvents.USER_FIND_BY_EMAIL)
    async handleFindByEmail({ email }: { email: string }): Promise<UserDocument | null> {
        return this.findByEmail(email);
    }

    @OnEvent(AppEvents.USER_FIND_BY_USERNAME)
    async handleFindByUsername({ username }: { username: string }): Promise<UserDocument | null> {
        return this.findByUsername(username);
    }

    @OnEvent(AppEvents.USER_CREATE)
    async handleCreate(data: Partial<User>): Promise<UserDocument> {
        return this.create(data);
    }

    @OnEvent(AppEvents.USER_UPDATE)
    async handleUpdate({ userId, updateData }: { userId: string, updateData: UpdateUserDto }): Promise<UserResponseDto> {
        return this.update(userId, updateData);
    }

    @OnEvent(AppEvents.USER_UPDATE_REFRESH_TOKEN)
    async handleUpdateRefreshToken({ userId, refreshToken }: { userId: string, refreshToken: string }): Promise<void> {
        return this.updateRefreshToken(userId, refreshToken);
    }

    @OnEvent(AppEvents.USER_VALIDATE_BY_EMAIL)
    async handleValidateByEmail({ email, password }: { email: string, password: string }): Promise<UserResponseDto | { error: string }> {
        try {
            return await this.validateUserByEmail(email, password);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                return { error: error.message };
            }
            return { error: 'Authentication failed' };
        }
    }

    @OnEvent(AppEvents.USER_FIND_ONE)
    async handleFindOne({ userId }: { userId: string }): Promise<UserResponseDto | { error: string }> {
        try {
            return await this.findOne(userId);
        } catch (error) {
            if (error instanceof HttpException) {
                return { error: error.message };
            }
            return { error: 'User not found' };
        }
    }

    @OnEvent(AppEvents.USER_CHECK_EXISTS)
    async handleCheckUserExists({ userId }: { userId: string }): Promise<boolean> {
        return this.checkUserExist(userId);
    }

    @OnEvent(AppEvents.USER_GET_BASIC_INFO)
    async handleGetBasicUserInfo({ userId }: { userId: string }): Promise<{ userId: string; username: string; fullName: string; avatarUrl?: string } | null> {
        return this.getBasicUserInfo(userId);
    }

    // ===== ADMIN EVENT LISTENERS =====
    @OnEvent(AppEvents.ADMIN_USER_GET_ALL)
    async handleAdminGetAllUsers(payload: {
        page?: number;
        limit?: number;
        search?: string;
        isActive?: boolean;
        dateFrom?: Date;
        dateTo?: Date;
    }) {
        const { page = 1, limit = 10, search, isActive, dateFrom, dateTo } = payload;
        const skip = (page - 1) * limit;
        const query: any = {};

        query.role = { $ne: 'admin' };

        if (search && search.trim()) {
            query.$or = [
                { email: { $regex: search.trim(), $options: 'i' } },
                { username: { $regex: search.trim(), $options: 'i' } },
                { fullName: { $regex: search.trim(), $options: 'i' } },
            ];
        }

        if (isActive !== undefined) {
            query.isActive = isActive;
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                query.createdAt.$gte = dateFrom;
            }
            if (dateTo) {
                query.createdAt.$lte = dateTo;
            }
        }

        const [users, total] = await Promise.all([
            this.userModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.userModel.countDocuments(query).exec(),
        ]);

        const userResponseDtos = users.map((user: any) =>
            plainToInstance(UserResponseDto, user, {
                excludeExtraneousValues: true,
            }),
        );

        return {
            data: userResponseDtos,
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

    @OnEvent(AppEvents.ADMIN_USER_GET_BY_ID)
    async handleAdminGetUserById({ userId }: { userId: string }) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const user = await this.userModel.findById(userId).lean().exec();
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        return plainToInstance(UserResponseDto, user, {
            excludeExtraneousValues: true,
        });
    }

    @OnEvent(AppEvents.ADMIN_USER_CREATE)
    async handleAdminCreateUser(payload: { createUserDto: any }) {
        const { createUserDto } = payload;
        const { confirmPassword, ...rest } = createUserDto;

        const existingUserByEmail = await this.userModel.findOne({ email: rest.email }).exec();
        if (existingUserByEmail) {
            throw new HttpException('Email is already in use', HttpStatus.BAD_REQUEST);
        }

        const existingUserByUsername = await this.userModel.findOne({ username: rest.username }).exec();
        if (existingUserByUsername) {
            throw new HttpException('Username is already taken', HttpStatus.BAD_REQUEST);
        }

        const hashedPassword = await bcrypt.hash(rest.password, 10);

        const newUser = new this.userModel({
            ...rest,
            password: hashedPassword,
            role: 'user',
            isActive: rest.isActive !== undefined ? rest.isActive : true,
        });

        const savedUser = await newUser.save();

        await this.eventEmitter.emitAsync(AppEvents.USER_CREATED, {
            userId: (savedUser._id as Types.ObjectId).toString(),
        });

        return plainToInstance(UserResponseDto, savedUser.toObject(), {
            excludeExtraneousValues: true,
        });
    }

    @OnEvent(AppEvents.ADMIN_USER_UPDATE)
    async handleAdminUpdateUser(payload: { userId: string; updateUserDto: any }) {
        const { userId, updateUserDto } = payload;
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const user = await this.userModel.findById(userId).exec();
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const { confirmPassword, ...restUpdate } = updateUserDto;

        if (restUpdate.email && restUpdate.email !== user.email) {
            const existingByEmail = await this.userModel
                .findOne({
                    email: restUpdate.email,
                    _id: { $ne: userId },
                })
                .exec();
            if (existingByEmail) {
                throw new HttpException('Email is already in use', HttpStatus.BAD_REQUEST);
            }
        }

        if (restUpdate.username && restUpdate.username !== user.username) {
            const existingByUsername = await this.userModel
                .findOne({
                    username: restUpdate.username,
                    _id: { $ne: userId },
                })
                .exec();
            if (existingByUsername) {
                throw new HttpException('Username is already taken', HttpStatus.BAD_REQUEST);
            }
        }

        const updateData: any = { ...restUpdate };

        if (restUpdate.password) {
            updateData.password = await bcrypt.hash(restUpdate.password, 10);
        }

        const updatedUser = await this.userModel
            .findByIdAndUpdate(userId, updateData, { new: true })
            .lean()
            .exec();

        if (!updatedUser) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        return plainToInstance(UserResponseDto, updatedUser, {
            excludeExtraneousValues: true,
        });
    }

    @OnEvent(AppEvents.ADMIN_USER_DELETE)
    async handleAdminDeleteUser({ userId }: { userId: string }) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
        }

        const user = await this.userModel.findById(userId).exec();
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        user.isActive = false;
        await user.save();

        return { message: 'User deleted successfully' };
    }

    @OnEvent(AppEvents.ADMIN_USERS_GROWTH)
    async handleAdminUsersGrowth({ days = 30 }: { days?: number }) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const users = await this.userModel
            .aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: startDate,
                            $lte: endDate,
                        },
                        role: { $ne: 'admin' },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
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

        return users;
    }

    @OnEvent(AppEvents.ADMIN_DASHBOARD_STATS)
    async handleAdminDashboardStats() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalUsers, newUsersThisMonth] = await Promise.all([
            this.userModel.countDocuments({ role: { $ne: 'admin' } }).exec(),
            this.userModel
                .countDocuments({
                    createdAt: { $gte: startOfMonth },
                    role: { $ne: 'admin' }
                })
                .exec(),
        ]);

        return {
            totalUsers,
            newUsersThisMonth,
        };
    }

    @OnEvent(AppEvents.USER_AGGREGATE)
    async handleUserAggregate(payload: { pipeline: any[] }) {
        const { pipeline } = payload;
        return await this.userModel.aggregate(pipeline).exec();
    }
}
