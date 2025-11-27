import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Message } from './schemas/message.schema';
import { plainToInstance } from 'class-transformer';
import {
    ConversationResponseDto,
    CreateConversationDto,
    MessageResponseDto,
    PaginatedResponseDto,
    SendMessageDto,
} from './dto';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel(Conversation.name) private readonly conversationModel: Model<Conversation>,
        @InjectModel(Message.name) private readonly messageModel: Model<Message>,
    ) { }

    // Lấy tất cả cuộc hội thoại của user với phân trang
    async getConversations(
        userId: string,
        page: number = 1,
        limit: number = 20,
    ): Promise<PaginatedResponseDto<ConversationResponseDto>> {
        const skip = (page - 1) * limit;

        // Tìm tất cả cuộc hội thoại mà user tham gia
        const [conversations, totalItems] = await Promise.all([
            this.conversationModel
                .find({ participants: new Types.ObjectId(userId) })
                .populate('participants', 'username fullName avatarUrl')
                .populate({
                    path: 'lastMessageId',
                    select: 'text createdAt senderId',
                    populate: {
                        path: 'senderId',
                        select: 'username fullName avatarUrl'
                    }
                })
                .populate('createdBy', 'username fullName avatarUrl')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.conversationModel.countDocuments({ participants: new Types.ObjectId(userId) }),
        ]);

        // Sắp xếp participants: đưa chính user lên đầu
        const conversationsSorted = conversations.map(conv => {
            if (conv.participants && conv.participants.length > 1) {
                conv.participants.sort((a, b) => {
                    if (a._id.toString() === userId) return -1; // user hiện tại lên đầu
                    if (b._id.toString() === userId) return 1;
                    return 0;
                });
            }
            return conv;
        });

        // Tính số tin nhắn chưa đọc cho mỗi cuộc hội thoại
        const conversationsWithUnread = await Promise.all(
            conversationsSorted.map(async (conv) => {
                const unreadCount = await this.messageModel.countDocuments({
                    conversationId: conv._id,
                    senderId: { $ne: new Types.ObjectId(userId) },
                    'seenBy.userId': { $ne: new Types.ObjectId(userId) },
                });

                return {
                    ...conv,
                    unreadCount,
                };
            }),
        );

        const totalPages = Math.ceil(totalItems / limit);

        // Convert ObjectId to string before transform
        const conversationsForTransform = conversationsWithUnread.map(conv => ({
            ...conv,
            _id: conv._id.toString(),
            lastMessageId: conv.lastMessageId ? {
                ...conv.lastMessageId,
                _id: conv.lastMessageId._id.toString()
            } : null
        }));

        const transformedData = plainToInstance(ConversationResponseDto, conversationsForTransform, {
            excludeExtraneousValues: true,
        });

        return {
            data: transformedData,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }

    // Tạo cuộc hội thoại mới hoặc lấy cuộc hội thoại đã tồn tại
    async createOrGetConversation(
        userId: string,
        createConversationDto: CreateConversationDto,
    ): Promise<ConversationResponseDto> {
        const { participantIds, isGroup, name, avatar } = createConversationDto;

        // Thêm userId vào danh sách participants
        const allParticipants = Array.from(
            new Set([userId, ...participantIds]),
        ).map((id) => new Types.ObjectId(id));

        // Nếu không phải group chat, kiểm tra xem đã có cuộc hội thoại giữa 2 người này chưa
        if (!isGroup && allParticipants.length === 2) {
            const existingConversation = await this.conversationModel
                .findOne({
                    isGroup: false,
                    participants: { $all: allParticipants, $size: 2 },
                })
                .populate('participants', 'username fullName avatarUrl')
                .populate('lastMessage.sender', 'username fullName avatarUrl')
                .lean()
                .exec();

            if (existingConversation) {
                return plainToInstance(ConversationResponseDto, existingConversation, {
                    excludeExtraneousValues: true,
                });
            }
        }

        // Tạo cuộc hội thoại mới
        const newConversation = await this.conversationModel.create({
            participants: allParticipants,
            isGroup: isGroup || false,
            name: isGroup ? name : undefined,
            avatar: isGroup ? avatar : undefined,
            createdBy: new Types.ObjectId(userId),
        });

        const populated = await this.conversationModel
            .findById(newConversation._id)
            .populate('participants', 'username fullName avatarUrl')
            .populate('createdBy', 'username fullName avatarUrl')
            .lean()
            .exec();

        return plainToInstance(ConversationResponseDto, populated, {
            excludeExtraneousValues: true,
        });
    }

    // Lấy chi tiết một cuộc hội thoại
    async getConversationById(
        conversationId: string,
        userId: string,
    ): Promise<ConversationResponseDto> {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        const conversation = await this.conversationModel
            .findOne({
                _id: new Types.ObjectId(conversationId),
                participants: new Types.ObjectId(userId),
            })
            .populate('participants', 'username fullName avatarUrl')
            .populate('lastMessage.sender', 'username fullName avatarUrl')
            .populate('createdBy', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!conversation) {
            throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
        }

        return plainToInstance(ConversationResponseDto, conversation, {
            excludeExtraneousValues: true,
        });
    }

    // Lấy tin nhắn trong cuộc hội thoại với phân trang
    async getMessages(
        conversationId: string,
        userId: string,
        page: number = 1,
        limit: number = 50,
    ): Promise<PaginatedResponseDto<MessageResponseDto>> {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        // Kiểm tra user có trong cuộc hội thoại không
        const conversation = await this.conversationModel
            .findOne({
                _id: new Types.ObjectId(conversationId),
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'Conversation not found or you are not a participant',
                HttpStatus.FORBIDDEN,
            );
        }

        const skip = (page - 1) * limit;

        const [messages, totalItems] = await Promise.all([
            this.messageModel
                .find({
                    conversationId: new Types.ObjectId(conversationId),
                    deletedFor: { $ne: new Types.ObjectId(userId) },
                    deletedForEveryone: false,
                })
                .populate('senderId', 'username fullName avatarUrl')
                .populate('replyTo')
                .populate('reactions.userId', 'username fullName avatarUrl')
                .populate('seenBy.userId', 'username fullName avatarUrl')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.messageModel.countDocuments({
                conversationId: new Types.ObjectId(conversationId),
                deletedFor: { $ne: new Types.ObjectId(userId) },
                deletedForEveryone: false,
            }),
        ]);

        // Transform messages to response format
        const transformedMessages = messages.map((msg: any) => {
            // Transform reactions: userId -> user
            const reactions = msg.reactions?.map((reaction: any) => ({
                user: reaction.userId,
                reaction: reaction.reaction,
            })) || [];

            // Transform seenBy: userId -> user
            const seenBy = msg.seenBy?.map((seen: any) => ({
                user: seen.userId,
                seenAt: seen.seenAt,
            })) || [];

            return {
                ...msg,
                _id: msg._id.toString(),
                conversationId: msg.conversationId.toString(),
                replyTo: msg.replyTo ? {
                    ...msg.replyTo,
                    _id: msg.replyTo._id?.toString(),
                    conversationId: msg.replyTo.conversationId?.toString(),
                } : null,
                reactions,
                seenBy,
            };
        });

        const totalPages = Math.ceil(totalItems / limit);

        return {
            data: plainToInstance(MessageResponseDto, transformedMessages, {
                excludeExtraneousValues: true,
            }),
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }

    // Gửi tin nhắn
    async sendMessage(
        userId: string,
        sendMessageDto: SendMessageDto,
    ): Promise<MessageResponseDto> {
        const { conversationId, text, attachments, replyTo } = sendMessageDto;

        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        // Kiểm tra user có trong cuộc hội thoại không
        const conversation = await this.conversationModel
            .findOne({
                _id: new Types.ObjectId(conversationId),
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'Conversation not found or you are not a participant',
                HttpStatus.FORBIDDEN,
            );
        }

        // Tạo tin nhắn mới
        const newMessage = await this.messageModel.create({
            conversationId: new Types.ObjectId(conversationId),
            senderId: new Types.ObjectId(userId),
            text: text || null,
            attachments: attachments || [],
            replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
            seenBy: [
                {
                    userId: new Types.ObjectId(userId),
                    seenAt: new Date(),
                },
            ],
        });

        // Cập nhật lastMessage trong conversation
        await this.conversationModel.findByIdAndUpdate(conversationId, {
            lastMessage: {
                messageId: newMessage._id,
                text: text || '',
                sender: new Types.ObjectId(userId),
                createdAt: newMessage.createdAt,
            },
            updatedAt: new Date(),
        });

        // Populate sender info
        const populatedMessage = await this.messageModel
            .findById(newMessage._id)
            .populate('senderId', 'username fullName avatarUrl')
            .populate('replyTo')
            .lean()
            .exec();

        if (!populatedMessage) {
            throw new HttpException('Failed to retrieve message', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const transformedMessage = {
            ...populatedMessage,
            sender: populatedMessage.senderId,
        };

        return plainToInstance(MessageResponseDto, transformedMessage, {
            excludeExtraneousValues: true,
        });
    }

    // Đánh dấu tin nhắn đã đọc
    async markMessagesAsRead(
        conversationId: string,
        userId: string,
        messageId?: string,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        const query: any = {
            conversationId: new Types.ObjectId(conversationId),
            senderId: { $ne: new Types.ObjectId(userId) },
            'seenBy.userId': { $ne: new Types.ObjectId(userId) },
        };

        // Nếu có messageId cụ thể, chỉ đánh dấu tin nhắn đó và tất cả tin nhắn trước đó
        if (messageId && Types.ObjectId.isValid(messageId)) {
            const message = await this.messageModel.findById(messageId).exec();
            if (message) {
                query.createdAt = { $lte: message.createdAt };
            }
        }

        await this.messageModel.updateMany(query, {
            $push: {
                seenBy: {
                    userId: new Types.ObjectId(userId),
                    seenAt: new Date(),
                },
            },
        });
    }

    // Kiểm tra user có quyền truy cập cuộc hội thoại không
    async checkUserInConversation(conversationId: string, userId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(userId)) {
            return false;
        }
        console.log('conversationId', conversationId);
        console.log('userId', userId);
        try {
            const conversation = await this.conversationModel
                .findOne({
                    _id: new Types.ObjectId(conversationId),
                    participants: new Types.ObjectId(userId),
                })
                .exec();
            console.log('conversation', conversation);
            return !!conversation;
        } catch (error) {
            console.error('Error checking user in conversation:', error);
            return false;
        }
    }
}
