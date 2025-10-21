import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import { Friend, FriendDocument } from './schemas/friend.schemas';
import { FriendRequest, FriendRequestDocument } from './schemas/friend-request.schema';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { RemoveFriendDto } from './dto/remove-friend.dto';
import { SearchFriendsDto } from './dto/search-friends.dto';
import { FriendSuggestionsDto } from './dto/friend-suggestions.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { User, UserDocument } from '../user/schemas/user.schema';

@Injectable()
export class FriendsService {
  constructor(
    @InjectModel(Friend.name) private readonly friendModel: Model<FriendDocument>,
    @InjectModel(FriendRequest.name) private readonly friendRequestModel: Model<FriendRequestDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) { }

  // Gửi lời mời kết bạn
  async sendFriendRequest(senderId: string, sendFriendRequestDto: SendFriendRequestDto) {
    const { receiver_id } = sendFriendRequestDto;

    // Kiểm tra không thể gửi lời mời cho chính mình
    if (senderId === receiver_id) {
      throw new HttpException('Không thể gửi lời mời kết bạn cho chính mình', HttpStatus.BAD_REQUEST);
    }

    // Kiểm tra đã là bạn bè chưa
    const existingFriendship = await this.friendModel.findOne({
      $or: [
        { user_id: new Types.ObjectId(senderId), friend_id: new Types.ObjectId(receiver_id) },
        { user_id: new Types.ObjectId(receiver_id), friend_id: new Types.ObjectId(senderId) }
      ]
    });

    if (existingFriendship) {
      throw new HttpException('Bạn đã là bạn bè với người này', HttpStatus.CONFLICT);
    }

    // Kiểm tra đã có lời mời chưa
    const existingRequest = await this.friendRequestModel.findOne({
      $or: [
        { sender_id: new Types.ObjectId(senderId), receiver_id: new Types.ObjectId(receiver_id) },
        { sender_id: new Types.ObjectId(receiver_id), receiver_id: new Types.ObjectId(senderId) }
      ]
    });

    if (existingRequest) {
      throw new HttpException('Đã có lời mời kết bạn đang chờ xử lý', HttpStatus.CONFLICT);
    }

    // Tạo lời mời kết bạn mới
    const friendRequest = new this.friendRequestModel({
      sender_id: new Types.ObjectId(senderId),
      receiver_id: new Types.ObjectId(receiver_id)
    });

    const savedRequest = await friendRequest.save();
    return await this.friendRequestModel.findById(savedRequest._id)
      .populate('sender_id', 'fullName username avatarUrl')
      .populate('receiver_id', 'fullName username avatarUrl');
  }

  // Phản hồi lời mời kết bạn (chấp nhận)
  async acceptedFriendRequest(userId: string, respondDto: RespondFriendRequestDto) {
    const { request_id } = respondDto;

    const friendRequest = await this.friendRequestModel.findById(request_id);
    if (!friendRequest) {
      throw new HttpException('Không tìm thấy lời mời kết bạn', HttpStatus.NOT_FOUND);
    }

    // Kiểm tra chỉ người nhận mới có thể phản hồi
    if (friendRequest.receiver_id.toString() !== userId) {
      throw new HttpException('Bạn không có quyền phản hồi lời mời này', HttpStatus.FORBIDDEN);
    }


    // Nếu chấp nhận, tạo quan hệ bạn bè
    if (friendRequest) {
      const friendship = new this.friendModel({
        user_id: friendRequest.sender_id,
        friend_id: friendRequest.receiver_id
      });
      await friendship.save();

      // Tạo quan hệ ngược lại
      const reverseFriendship = new this.friendModel({
        user_id: friendRequest.receiver_id,
        friend_id: friendRequest.sender_id
      });
      await reverseFriendship.save();
    }

    await this.friendRequestModel.findByIdAndDelete(request_id);
    return { message: 'Đã chấp nhận lời mời kết bạn' };
  }

  // Từ chối lời mời kết bạn 
  async rejectedFriendRequest(userId: string, requestId: string) {
    const friendRequest = await this.friendRequestModel.findById(requestId);

    if (!friendRequest) {
      throw new HttpException('Không tìm thấy lời mời kết bạn', HttpStatus.NOT_FOUND);
    }

    if (friendRequest.sender_id.toString() === userId) {
      throw new HttpException('Bạn không có quyền từ chối lời mời này', HttpStatus.FORBIDDEN);
    }

    await this.friendRequestModel.findByIdAndDelete(requestId);
    return { message: 'Đã từ chối lời mời kết bạn thành công' };
  }

  // Xóa bạn bè
  async removeFriend(userId: string, removeFriendDto: RemoveFriendDto) {
    const { friend_id } = removeFriendDto;

    // Kiểm tra quan hệ bạn bè có tồn tại không
    const friendship = await this.friendModel.findOne({
      user_id: new Types.ObjectId(userId),
      friend_id: new Types.ObjectId(friend_id)
    });

    if (!friendship) {
      throw new HttpException('Bạn không phải bạn bè với người này', HttpStatus.NOT_FOUND);
    }

    // Xóa cả 2 chiều quan hệ bạn bè
    await this.friendModel.deleteMany({
      $or: [
        { user_id: new Types.ObjectId(userId), friend_id: new Types.ObjectId(friend_id) },
        { user_id: new Types.ObjectId(friend_id), friend_id: new Types.ObjectId(userId) }
      ]
    });

    await this.friendRequestModel.deleteMany({
      $or: [
        { sender_id: new Types.ObjectId(userId), receiver_id: new Types.ObjectId(friend_id) },
        { sender_id: new Types.ObjectId(friend_id), receiver_id: new Types.ObjectId(userId) }
      ]
    });

    return { message: 'Đã xóa bạn bè thành công' };
  }

  // Lấy danh sách bạn bè
  async getFriends(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    
    // Sử dụng aggregation để lấy thông tin bạn bè kèm bạn chung
    const friendsWithMutualInfo = await this.friendModel.aggregate([
      // Bước 1: Lọc bạn bè của user hiện tại
      {
        $match: { user_id: userObjectId }
      },
      // Bước 2: Lookup thông tin user của bạn bè
      {
        $lookup: {
          from: 'users',
          localField: 'friend_id',
          foreignField: '_id',
          as: 'friendInfo'
        }
      },
      {
        $unwind: '$friendInfo'
      },
      // Bước 3: Lookup để tìm danh sách bạn bè của từng friend
      {
        $lookup: {
          from: 'friends',
          localField: 'friend_id',
          foreignField: 'user_id',
          as: 'friendOfFriend'
        }
      },
      // Bước 4: Lookup danh sách bạn của user để tìm giao điểm
      {
        $lookup: {
          from: 'friends',
          let: { friendOfFriendIds: '$friendOfFriend.friend_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$user_id', userObjectId] },
                    { $in: ['$friend_id', '$$friendOfFriendIds'] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: 'users',
                localField: 'friend_id',
                foreignField: '_id',
                as: 'mutualUserInfo'
              }
            },
            {
              $unwind: '$mutualUserInfo'
            },
            {
              $project: {
                avatarUrl: '$mutualUserInfo.avatarUrl'
              }
            },
            { $limit: 3 }
          ],
          as: 'mutualFriends'
        }
      },
      // Bước 5: Project kết quả cuối cùng
      {
        $project: {
          _id: '$friendInfo._id',
          fullName: '$friendInfo.fullName',
          username: '$friendInfo.username',
          avatarUrl: '$friendInfo.avatarUrl',
          bio: '$friendInfo.bio',
          mutualFriendsCount: { $size: '$mutualFriends' },
          mutualFriendAvatars: {
            $map: {
              input: '$mutualFriends',
              as: 'mutual',
              in: '$$mutual.avatarUrl'
            }
          },
          friendsSince: '$createdAt'
        }
      }
    ]);

    return friendsWithMutualInfo;
  }

  // Event listener 
  @OnEvent(AppEvents.FRIENDS_GET)
  async onGetFriendsEvent(payload: { userId: string }) {
    return await this.getFriends(payload.userId);
  }

  // Tìm kiếm bạn bè
  async searchFriends(userId: string, searchDto: SearchFriendsDto) {
    const { query, page = 1, limit = 10 } = searchDto;
    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      // Lọc những bạn bè của user hiện tại
      {
        $match: {
          user_id: new Types.ObjectId(userId)
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'friend_id',
          foreignField: '_id',
          as: 'friendInfo'
        }
      },
      { $unwind: '$friendInfo' },
    ];

    // Nếu có từ khóa tìm kiếm, thêm điều kiện match
    if (query && query.trim()) {
      pipeline.push({
        $match: {
          $or: [
            { 'friendInfo.fullName': { $regex: query.trim(), $options: 'i' } },
            { 'friendInfo.username': { $regex: query.trim(), $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push({
      $project: {
        _id: '$friendInfo._id',
        fullName: '$friendInfo.fullName',
        username: '$friendInfo.username',
        avatarUrl: '$friendInfo.avatarUrl',
        bio: '$friendInfo.bio',
        friendsSince: '$createdAt'
      }
    });

    // Sắp xếp theo tên
    pipeline.push({ $sort: { fullName: 1 } });

    // Tạo pipeline để đếm tổng số kết quả
    const countPipeline = [...pipeline, { $count: 'total' }];

    pipeline.push({ $skip: skip }, { $limit: limit });

    const [friends, countResult] = await Promise.all([
      this.friendModel.aggregate(pipeline),
      this.friendModel.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      friends,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  // Lấy danh sách lời mời kết bạn đã nhận
  async getReceivedRequests(userId: string) {
    return await this.friendRequestModel.find({
      receiver_id: new Types.ObjectId(userId)
    })
      .populate('sender_id', 'fullName username avatarUrl')
      .sort({ createdAt: -1 });
  }

  // Lấy danh sách lời mời kết bạn đã gửi
  async getSentRequests(userId: string) {
    return await this.friendRequestModel.find({
      sender_id: new Types.ObjectId(userId)
    })
      .populate('receiver_id', 'fullName username avatarUrl')
      .sort({ createdAt: -1 });
  }

  // Hủy lời mời kết bạn đã gửi
  async cancelFriendRequest(userId: string, requestId: string) {
    const friendRequest = await this.friendRequestModel.findById(requestId);

    if (!friendRequest) {
      throw new HttpException('Không tìm thấy lời mời kết bạn', HttpStatus.NOT_FOUND);
    }

    if (friendRequest.sender_id.toString() !== userId) {
      throw new HttpException('Bạn không có quyền hủy lời mời này', HttpStatus.FORBIDDEN);
    }

    await this.friendRequestModel.findByIdAndDelete(requestId);
    return { message: 'Đã hủy lời mời kết bạn thành công' };
  }

  // Kiểm tra trạng thái quan hệ với một user khác
  async getRelationshipStatus(userId: string, targetUserId: string) {
    // Kiểm tra đã là bạn bè chưa
    const friendship = await this.friendModel.findOne({
      user_id: new Types.ObjectId(userId),
      friend_id: new Types.ObjectId(targetUserId)
    });

    if (friendship) {
      return { status: 'friends', message: 'Đã là bạn bè' };
    }

    const sentRequest = await this.friendRequestModel.findOne({
      sender_id: new Types.ObjectId(userId),
      receiver_id: new Types.ObjectId(targetUserId)
    });

    if (sentRequest) {
      return { status: 'request_sent', message: 'Đã gửi lời mời kết bạn' };
    }

    const receivedRequest = await this.friendRequestModel.findOne({
      sender_id: new Types.ObjectId(targetUserId),
      receiver_id: new Types.ObjectId(userId)
    });

    if (receivedRequest) {
      return { status: 'request_received', message: 'Có lời mời kết bạn chờ phản hồi' };
    }

    return { status: 'none', message: 'Không có quan hệ' };
  }

  // Lấy danh sách bạn chung giữa 2 user
  async getMutualFriends(userId: string, targetUserId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    // Sử dụng aggregation để tìm bạn chung
    const basePipeline: PipelineStage[] = [
      // Tìm tất cả bạn bè của user hiện tại
      {
        $match: {
          user_id: new Types.ObjectId(userId)
        }
      },
      // Tìm bạn bè của target user
      {
        $lookup: {
          from: 'friends',
          let: { friendId: '$friend_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$user_id', new Types.ObjectId(targetUserId)] },
                    { $eq: ['$friend_id', '$$friendId'] }
                  ]
                }
              }
            }
          ],
          as: 'mutualFriend'
        }
      },
      // Chỉ lấy những người là bạn chung
      {
        $match: {
          'mutualFriend.0': { $exists: true }
        }
      },
      // Populate thông tin người dùng
      {
        $lookup: {
          from: 'users',
          localField: 'friend_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      // Project các trường cần thiết
      {
        $project: {
          _id: '$userInfo._id',
          fullName: '$userInfo.fullName',
          username: '$userInfo.username',
          avatarUrl: '$userInfo.avatarUrl',
          bio: '$userInfo.bio',
          friendsSince: '$createdAt'
        }
      },
      // Sắp xếp theo tên
      {
        $sort: { fullName: 1 }
      }
    ];

    // Tạo pipeline để đếm tổng số kết quả
    const countPipeline = [...basePipeline, { $count: 'total' }];

    // Tạo pipeline với phân trang
    const paginatedPipeline = [...basePipeline, { $skip: skip }, { $limit: limit }];

    const [mutualFriends, countResult] = await Promise.all([
      this.friendModel.aggregate(paginatedPipeline),
      this.friendModel.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      mutualFriends,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  // Gợi ý bạn bè ngẫu nhiên
  async getFriendSuggestions(userId: string, suggestionsDto: FriendSuggestionsDto) {
    const { limit = 10, page = 1 } = suggestionsDto;
    const skip = (page - 1) * limit;

    // Lấy thông tin user hiện tại
    const currentUser = await this.userModel.findById(userId);
    if (!currentUser) {
      throw new HttpException('Không tìm thấy người dùng', HttpStatus.NOT_FOUND);
    }

    // Lấy danh sách ID của bạn bè hiện tại và lời mời đã gửi/nhận
    const [friends, sentRequests, receivedRequests] = await Promise.all([
      this.friendModel.find({ user_id: new Types.ObjectId(userId) }).select('friend_id'),
      this.friendRequestModel.find({ sender_id: new Types.ObjectId(userId) }).select('receiver_id'),
      this.friendRequestModel.find({ receiver_id: new Types.ObjectId(userId) }).select('sender_id')
    ]);

    const excludedUserIds = [
      new Types.ObjectId(userId), // Loại trừ chính mình
      ...friends.map(f => f.friend_id), // Loại trừ bạn bè hiện tại
      ...sentRequests.map(r => r.receiver_id), // Loại trừ những người đã gửi lời mời
      ...receivedRequests.map(r => r.sender_id) // Loại trừ những người đã nhận lời mời
    ];

    // Tạo pipeline aggregation để ưu tiên người có bạn chung, vẫn thêm yếu tố ngẫu nhiên
    const pipeline: PipelineStage[] = [
      // Loại trừ những người không nên gợi ý
      {
        $match: {
          _id: { $nin: excludedUserIds },
          isActive: true // Chỉ gợi ý user đang hoạt động
        }
      },
      // Tính số bạn chung giữa currentUser và từng user mục tiêu
      {
        $lookup: {
          from: 'friends',
          let: { targetUserId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$user_id', '$$targetUserId'] } } },
            {
              $lookup: {
                from: 'friends',
                let: { mutualFriendId: '$friend_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$user_id', new Types.ObjectId(userId)] },
                          { $eq: ['$friend_id', '$$mutualFriendId'] }
                        ]
                      }
                    }
                  }
                ],
                as: 'isMutual'
              }
            },
            { $match: { 'isMutual.0': { $exists: true } } },
            { $count: 'mutualCount' }
          ],
          as: 'mutualFriends'
        }
      },
      // Tạo điểm ngẫu nhiên và điểm ưu tiên
      {
        $addFields: {
          mutualFriendsCount: { $ifNull: [{ $arrayElemAt: ['$mutualFriends.mutualCount', 0] }, 0] },
          randomScore: { $rand: {} },
        }
      },
      {
        $addFields: {
          // Ưu tiên mạnh cho bạn chung, thêm chút ngẫu nhiên để đa dạng
          suggestionScore: {
            $add: [
              { $multiply: ['$mutualFriendsCount', 1000] },
              { $multiply: ['$randomScore', 100] }
            ]
          }
        }
      },
      // Sắp xếp theo điểm gợi ý giảm dần
      { $sort: { suggestionScore: -1, createdAt: -1 } },
      // Project các trường cần thiết
      {
        $project: {
          _id: 1,
          fullName: 1,
          username: 1,
          avatarUrl: 1,
          bio: 1,
          gender: 1,
          dateOfBirth: 1,
          createdAt: 1,
          randomScore: 1,
          mutualFriendsCount: 1,
          suggestionScore: 1
        }
      }
    ];

    // Tạo pipeline để đếm tổng số kết quả
    const countPipeline = [...pipeline, { $count: 'total' }];

    // Tạo pipeline với phân trang
    const paginatedPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

    const [suggestions, countResult] = await Promise.all([
      this.userModel.aggregate(paginatedPipeline),
      this.userModel.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
      suggestions,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

}
