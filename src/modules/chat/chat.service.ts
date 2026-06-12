import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Message } from './schemas/message.schema';
import { MessageEditLog } from './schemas/message-edit-log.schema';
import { ChatFile } from './schemas/chat-file.schema';
import { plainToInstance } from 'class-transformer';
import { File } from 'multer';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import {
    ConversationResponseDto,
    CreateConversationDto,
    MessageResponseDto,
    MessageEditLogResponseDto,
    PaginatedResponseDto,
    SendMessageDto,
    UpdateMessageDto,
    UpdateConversationDto,
    DeleteMessageDto,
    AttachmentDto,
} from './dto';
import { uploadChatAttachmentFromFile } from './helpers/upload-attachments.helper';
import { AttachmentType } from 'src/shared/enums/Attachment_type';
import { AiService } from 'src/shared/services/summarize-messages.service';
import { GoogleTranslationService } from 'src/shared/translation/google-translation.service';
import { langsMatch } from 'src/shared/translation/lang-compare.util';

@Injectable()
export class ChatService {
    constructor(
        @InjectModel(Conversation.name) private readonly conversationModel: Model<Conversation>,
        @InjectModel(Message.name) private readonly messageModel: Model<Message>,
        @InjectModel(MessageEditLog.name) private readonly messageEditLogModel: Model<MessageEditLog>,
        @InjectModel(ChatFile.name) private readonly chatFileModel: Model<ChatFile>,
        private readonly eventEmitter: EventEmitter2,
        private readonly aiService: AiService,
        private readonly googleTranslationService: GoogleTranslationService,
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
                    select: 'text createdAt senderId attachments',
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
        // const conversationsSorted = conversations.map(conv => {
        //     if (conv.participants && conv.participants.length > 1) {
        //         conv.participants.sort((a, b) => {
        //             if (a._id.toString() === userId) return -1; // user hiện tại lên đầu
        //             if (b._id.toString() === userId) return 1;
        //             return 0;
        //         });
        //     }
        //     return conv;
        // });

        // Tính số tin nhắn chưa đọc và index tin nhắn chưa đọc đầu tiên cho mỗi cuộc hội thoại
        const userIdObjectId = new Types.ObjectId(userId);
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await this.messageModel.countDocuments({
                    conversationId: conv._id,
                    senderId: { $ne: userIdObjectId },
                    'seenBy.userId': { $ne: userIdObjectId },
                    deletedFor: { $nin: [userIdObjectId] },
                });

                // Tính toán index của tin nhắn chưa đọc đầu tiên
                const firstUnreadMessageIndex = await this.calculateFirstUnreadMessageIndex(
                    conv._id.toString(),
                    userId,
                    unreadCount,
                );

                return {
                    ...conv,
                    unreadCount,
                    firstUnreadMessageIndex,
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
    ): Promise<{ conversation: ConversationResponseDto; isNew: boolean }> {
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
                .populate({
                    path: 'lastMessageId',
                    select: 'text createdAt senderId attachments',
                    populate: {
                        path: 'senderId',
                        select: 'username fullName avatarUrl'
                    }
                })
                .lean()
                .exec();

            if (existingConversation) {
                return {
                    conversation: plainToInstance(ConversationResponseDto, existingConversation, {
                        excludeExtraneousValues: true,
                    }),
                    isNew: false,
                };
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

        return {
            conversation: plainToInstance(ConversationResponseDto, populated, {
                excludeExtraneousValues: true,
            }),
            isNew: true,
        };
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
            .populate({
                path: 'lastMessageId',
                select: 'text createdAt senderId attachments',
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('createdBy', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!conversation) {
            throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
        }
        //  console.log('>>> userID: ', userId);
        const userIdObjectId = new Types.ObjectId(userId);

        const unreadCount = await this.messageModel.countDocuments({
            conversationId: conversation._id,
            senderId: { $ne: userIdObjectId },
            'seenBy.userId': { $ne: userIdObjectId },
            deletedFor: { $nin: [userIdObjectId] },
        });

        // Tính toán index của tin nhắn chưa đọc đầu tiên
        const firstUnreadMessageIndex = await this.calculateFirstUnreadMessageIndex(
            conversationId,
            userId,
            unreadCount,
        );

        // Sắp xếp participants: đưa chính user lên đầu
        // if (conversation.participants && conversation.participants.length > 1) {
        //     conversation.participants.sort((a, b) => {
        //         if (a._id.toString() === userId) return -1; // user hiện tại lên đầu
        //         if (b._id.toString() === userId) return 1;
        //         return 0;
        //     });
        // }

        const conversationWithUnread = {
            ...conversation,
            unreadCount,
            firstUnreadMessageIndex,
        };

        const conversationForTransform = {
            ...conversationWithUnread,
            _id: conversationWithUnread._id.toString(),
            lastMessageId: conversationWithUnread.lastMessageId ? {
                ...conversationWithUnread.lastMessageId,
                _id: conversationWithUnread.lastMessageId._id.toString()
            } : null
        };

        return plainToInstance(ConversationResponseDto, conversationForTransform, {
            excludeExtraneousValues: true,
        });
    }

    // Cập nhật thông tin conversation (tên, avatar, người tạo, thêm thành viên)
    async updateConversation(
        conversationId: string,
        userId: string,
        updateConversationDto: UpdateConversationDto,
    ): Promise<ConversationResponseDto> {
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

        // Chỉ cho phép update group conversation
        if (!conversation.isGroup) {
            throw new HttpException(
                'Cannot update non-group conversation',
                HttpStatus.BAD_REQUEST,
            );
        }

        // Chuẩn bị object update
        const updateData: any = {
            updatedAt: new Date(),
        };

        if (updateConversationDto.name !== undefined) {
            updateData.name = updateConversationDto.name;
        }

        if (updateConversationDto.avatar !== undefined) {
            updateData.avatar = updateConversationDto.avatar;
        }

        if (updateConversationDto.createdBy !== undefined) {
            if (!Types.ObjectId.isValid(updateConversationDto.createdBy)) {
                throw new HttpException('Invalid createdBy user ID', HttpStatus.BAD_REQUEST);
            }
            // Kiểm tra user được chỉ định có trong participants không
            const newCreatedBy = new Types.ObjectId(updateConversationDto.createdBy);
            if (!conversation.participants.some(p => p.equals(newCreatedBy))) {
                throw new HttpException(
                    'CreatedBy user must be a participant',
                    HttpStatus.BAD_REQUEST,
                );
            }
            updateData.createdBy = newCreatedBy;
        }

        // Thêm thành viên mới nếu có
        if (updateConversationDto.participantIds && updateConversationDto.participantIds.length > 0) {
            const newParticipantIds = updateConversationDto.participantIds.map(
                id => new Types.ObjectId(id)
            );

            // Validate tất cả participant IDs
            for (const id of updateConversationDto.participantIds) {
                if (!Types.ObjectId.isValid(id)) {
                    throw new HttpException(`Invalid participant ID: ${id}`, HttpStatus.BAD_REQUEST);
                }
            }

            // Thêm participants mới vào danh sách (tránh trùng lặp)
            const existingParticipantIds = conversation.participants.map(p => p.toString());
            const uniqueNewParticipants = newParticipantIds.filter(
                id => !existingParticipantIds.includes(id.toString())
            );

            if (uniqueNewParticipants.length > 0) {
                updateData.$addToSet = {
                    participants: { $each: uniqueNewParticipants }
                };
            }
        }

        // Cập nhật conversation
        const updatedConversation = await this.conversationModel
            .findByIdAndUpdate(
                conversationId,
                updateData,
                { new: true }
            )
            .populate('participants', 'username fullName avatarUrl')
            .populate({
                path: 'lastMessageId',
                select: 'text createdAt senderId attachments',
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('createdBy', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!updatedConversation) {
            throw new HttpException('Failed to update conversation', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Tính unreadCount cho user
        const userIdObjectId = new Types.ObjectId(userId);
        const unreadCount = await this.messageModel.countDocuments({
            conversationId: updatedConversation._id,
            senderId: { $ne: userIdObjectId },
            'seenBy.userId': { $ne: userIdObjectId },
            deletedFor: { $nin: [userIdObjectId] },
        });

        // Tính toán index của tin nhắn chưa đọc đầu tiên
        const firstUnreadMessageIndex = await this.calculateFirstUnreadMessageIndex(
            conversationId,
            userId,
            unreadCount,
        );

        const conversationWithUnread = {
            ...updatedConversation,
            unreadCount,
            firstUnreadMessageIndex,
        };

        const conversationForTransform = {
            ...conversationWithUnread,
            _id: conversationWithUnread._id.toString(),
            lastMessageId: conversationWithUnread.lastMessageId ? {
                ...conversationWithUnread.lastMessageId,
                _id: conversationWithUnread.lastMessageId._id.toString()
            } : null
        };

        return plainToInstance(ConversationResponseDto, conversationForTransform, {
            excludeExtraneousValues: true,
        });
    }

    // Lấy tất cả participants của conversation
    async getParticipants(conversationId: string): Promise<any[]> {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        const conversation = await this.conversationModel
            .findById(conversationId)
            .populate('participants', '_id username fullName avatarUrl')
            .lean()
            .exec();

        if (!conversation) {
            throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
        }

        return conversation.participants || [];
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

        const userIdObjectId = new Types.ObjectId(userId);

        const [messages, totalItems] = await Promise.all([
            this.messageModel
                .find({
                    conversationId: new Types.ObjectId(conversationId),
                    deletedFor: { $nin: [userIdObjectId] }, // userId không có trong deletedFor array
                    // Vẫn lấy message bị xóa cho mọi người để hiển thị ở frontend
                })
                .populate('senderId', 'username fullName avatarUrl')
                .populate({
                    path: 'replyTo',
                    select: 'text senderId createdAt updatedAt conversationId _id attachments',
                    match: {
                        deletedFor: { $nin: [userIdObjectId] },
                    },
                    populate: {
                        path: 'senderId',
                        select: 'username fullName avatarUrl'
                    }
                })
                .populate({
                    path: 'storyId',
                    select: 'title mediaUrl mediaType userId createdAt',
                    populate: {
                        path: 'userId',
                        select: 'username fullName avatarUrl'
                    }
                })
                .populate('reactions.userId', 'username fullName avatarUrl')
                .populate('reactions.emojiId', 'label icon')
                .populate('seenBy.userId', 'username fullName avatarUrl')
                .sort({ createdAt: -1 }) // Sort giảm dần: mới nhất trước
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.messageModel.countDocuments({
                conversationId: new Types.ObjectId(conversationId),
                deletedFor: { $nin: [userIdObjectId] },
            }),
        ]);

        // Transform messages to response format
        const transformedMessages = messages.map((msg: any) => this.transformMessage(msg));

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

    // Tìm trang chứa message với messageId và trả về trang đó
    async getMessagesAroundId(
        conversationId: string,
        userId: string,
        messageId: string,
        limit: number = 20,
    ): Promise<PaginatedResponseDto<MessageResponseDto>> {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new HttpException('Invalid conversation ID', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
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

        const userIdObjectId = new Types.ObjectId(userId);

        // Tìm message với messageId
        const targetMessage = await this.messageModel
            .findOne({
                _id: new Types.ObjectId(messageId),
                conversationId: new Types.ObjectId(conversationId),
                deletedFor: { $nin: [userIdObjectId] },
                // Vẫn lấy message bị xóa cho mọi người để hiển thị ở frontend
            })
            .exec();

        if (!targetMessage) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // Tính tổng số messages
        const totalItems = await this.messageModel.countDocuments({
            conversationId: new Types.ObjectId(conversationId),
            deletedFor: { $nin: [userIdObjectId] },
        });

        // Tính số messages mới hơn target message (createdAt > targetMessage.createdAt)
        // Vì sort từ mới nhất đến cũ nhất, messages mới hơn sẽ ở các trang trước
        const countNewerMessages = await this.messageModel.countDocuments({
            conversationId: new Types.ObjectId(conversationId),
            deletedFor: { $nin: [userIdObjectId] },
            createdAt: { $gt: targetMessage.createdAt },
        });

        // Tính page chứa target message
        // Page = số messages mới hơn / limit + 1
        const currentPage = Math.floor(countNewerMessages / limit) + 1;
        const totalPages = Math.ceil(totalItems / limit);
        const skip = (currentPage - 1) * limit;

        // Lấy messages của trang đó (sort từ mới nhất đến cũ nhất)
        const messages = await this.messageModel
            .find({
                conversationId: new Types.ObjectId(conversationId),
                deletedFor: { $nin: [userIdObjectId] },
            })
            .populate('senderId', 'username fullName avatarUrl')
            .populate({
                path: 'replyTo',
                select: 'text senderId createdAt updatedAt conversationId _id attachments',
                match: {
                    deletedFor: { $nin: [userIdObjectId] },
                },
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate({
                path: 'storyId',
                select: 'title mediaUrl mediaType userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('reactions.userId', 'username fullName avatarUrl')
            .populate('reactions.emojiId', 'label icon')
            .populate('seenBy.userId', 'username fullName avatarUrl')
            .sort({ createdAt: -1 }) // Mới nhất trước
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();

        // Transform messages to response format
        const transformedMessages = messages.map((msg: any) => this.transformMessage(msg));

        return {
            data: plainToInstance(MessageResponseDto, transformedMessages, {
                excludeExtraneousValues: true,
            }),
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                itemsPerPage: limit,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1,
            },
        };
    }

    // Gửi tin nhắn
    async sendMessage(
        userId: string,
        sendMessageDto: SendMessageDto,
    ): Promise<MessageResponseDto> {
        const { conversationId, text, attachments, replyTo, metadata, storyId } = sendMessageDto;

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

        // Verify story exists if storyId is provided
        if (storyId) {
            if (!Types.ObjectId.isValid(storyId)) {
                throw new HttpException('Invalid story ID', HttpStatus.BAD_REQUEST);
            }
            const [story] = await this.eventEmitter.emitAsync(AppEvents.STORY_GET_USER_ID, { storyId });
            if (!story) {
                throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
            }
        }

        // Tạo tin nhắn mới
        const newMessage = await this.messageModel.create({
            conversationId: new Types.ObjectId(conversationId),
            senderId: new Types.ObjectId(userId),
            text: text || null,
            attachments: attachments || [],
            replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
            storyId: storyId ? new Types.ObjectId(storyId) : null,
            metadata: metadata || null,
            seenBy: [
                {
                    userId: new Types.ObjectId(userId),
                    seenAt: new Date(),
                },
            ],
        });

        // Cập nhật lastMessageId trong conversation
        await this.conversationModel.findByIdAndUpdate(conversationId, {
            lastMessageId: newMessage._id,
            updatedAt: new Date(),
        });

        // Populate đầy đủ như getMessages
        const userIdObjectId = new Types.ObjectId(userId);
        const populatedMessage = await this.messageModel
            .findById(newMessage._id)
            .populate('senderId', 'username fullName avatarUrl')
            .populate({
                path: 'replyTo',
                select: 'text senderId createdAt updatedAt conversationId _id attachments',
                match: {
                    deletedFor: { $nin: [userIdObjectId] },
                },
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate({
                path: 'storyId',
                select: 'title mediaUrl mediaType userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('reactions.userId', 'username fullName avatarUrl')
            .populate('reactions.emojiId', 'label icon')
            .populate('seenBy.userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!populatedMessage) {
            throw new HttpException('Failed to retrieve message', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Transform message sang response format
        return this.transformToMessageResponseDto(populatedMessage);
    }

    // Upload files lên Cloudinary và trả về URLs (không tạo message)
    async sendMessageWithFiles(
        userId: string,
        sendMessageDto: SendMessageDto,
        baseUrl: string,
        files?: File[],
    ): Promise<AttachmentDto[]> {
        const { conversationId } = sendMessageDto;

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

        // Xử lý upload files nếu có (từ Multer)
        let finalAttachments: AttachmentDto[] = [];
        if (files && files.length > 0) {
            try {
                for (const file of files) {
                    const mimetype = file.mimetype;
                    const isVideo = mimetype?.startsWith('video/');
                    const isImage = mimetype?.startsWith('image/');
                    const isAudio = mimetype?.startsWith('audio/');

                    if (isVideo || isImage || isAudio) {
                        const uploaded = await uploadChatAttachmentFromFile(file, conversationId);
                        finalAttachments.push({
                            url: uploaded.url,
                            type: uploaded.type,
                            size: uploaded.size,
                            name: uploaded.name,
                        });
                    } else {
                        // Raw files: save to DB
                        const chatFile = await this.chatFileModel.create({
                            filename: file.originalname,
                            mimetype: file.mimetype,
                            data: file.buffer,
                            size: file.size,
                        });

                        finalAttachments.push({
                            url: `/chat/file/${chatFile._id}`,
                            type: AttachmentType.FILE as any,
                            size: file.size,
                            name: file.originalname,
                        });
                    }
                }
            } catch (error) {
                console.error('Error uploading files:', error);
                throw new HttpException(
                    'Failed to upload files',
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }
        }

        // Chỉ trả về attachments, không tạo message
        return finalAttachments;
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

    // Chỉnh sửa tin nhắn (chỉ cho phép trong 15 phút)
    async updateMessage(
        userId: string,
        updateMessageDto: UpdateMessageDto,
    ): Promise<MessageResponseDto> {
        const { messageId, newText } = updateMessageDto;

        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
        }

        // Tìm message
        const message = await this.messageModel.findById(messageId).exec();

        if (!message) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // Kiểm tra user có phải là người gửi không
        if (message.senderId.toString() !== userId) {
            throw new HttpException(
                'You can only edit your own messages',
                HttpStatus.FORBIDDEN,
            );
        }

        // Kiểm tra thời gian: chỉ cho phép sửa trong 15 phút
        const now = new Date();
        const messageCreatedAt = message.createdAt || message.updatedAt || now;
        const messageAge = now.getTime() - messageCreatedAt.getTime();
        const fifteenMinutes = 15 * 60 * 1000; // 15 phút tính bằng milliseconds

        if (messageAge > fifteenMinutes) {
            throw new HttpException(
                'You can only edit messages within 15 minutes of sending',
                HttpStatus.BAD_REQUEST,
            );
        }

        // Lưu nội dung cũ để log
        const oldText = message.text || '';

        // Lưu log chỉnh sửa
        await this.messageEditLogModel.create({
            messageId: message._id,
            oldText,
            newText: newText,
            editedBy: new Types.ObjectId(userId),
            editedAt: now,
        });

        // Cập nhật tin nhắn
        message.text = newText;
        message.isEdited = true;
        message.updatedAt = now;
        await message.save();

        // Populate và trả về message đã được update
        const userIdObjectIdForUpdate = new Types.ObjectId(userId);
        const populatedMessage = await this.messageModel
            .findById(message._id)
            .populate('senderId', 'username fullName avatarUrl')
            .populate({
                path: 'replyTo',
                select: 'text senderId createdAt updatedAt conversationId _id attachments',
                match: {
                    deletedFor: { $nin: [userIdObjectIdForUpdate] },
                },
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate({
                path: 'storyId',
                select: 'title mediaUrl mediaType userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('reactions.userId', 'username fullName avatarUrl')
            .populate('reactions.emojiId', 'label icon')
            .populate('seenBy.userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!populatedMessage) {
            throw new HttpException('Failed to retrieve updated message', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Transform message sang response format
        return this.transformToMessageResponseDto(populatedMessage);
    }

    // Thêm hoặc xóa reaction vào message (toggle)
    async addReactionToMessage(
        userId: string,
        messageId: string,
        emojiId: string,
    ): Promise<MessageResponseDto> {
        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
        }

        if (!Types.ObjectId.isValid(emojiId)) {
            throw new HttpException('Invalid emoji ID', HttpStatus.BAD_REQUEST);
        }

        // Tìm message
        const message = await this.messageModel.findById(messageId).exec();

        if (!message) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // Kiểm tra user có trong conversation không
        const conversation = await this.conversationModel
            .findOne({
                _id: message.conversationId,
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'You do not have access to this message',
                HttpStatus.FORBIDDEN,
            );
        }

        const userIdObjectId = new Types.ObjectId(userId);
        const emojiIdObjectId = new Types.ObjectId(emojiId);

        // Tìm tất cả reactions của user này
        const userReactions = message.reactions.filter(
            (reaction) => reaction.userId.toString() === userId,
        );

        // Kiểm tra xem user đã react với emoji này chưa
        const existingReactionIndex = message.reactions.findIndex(
            (reaction) =>
                reaction.userId.toString() === userId &&
                reaction.emojiId.toString() === emojiId,
        );

        if (existingReactionIndex !== -1) {
            // Đã có reaction với emoji này -> xóa (toggle off)
            message.reactions.splice(existingReactionIndex, 1);
        } else {
            // Chưa có reaction với emoji này
            // Nếu user đã react với emoji khác, xóa tất cả reactions cũ của user
            if (userReactions.length > 0) {
                // Xóa tất cả reactions cũ của user
                message.reactions = message.reactions.filter(
                    (reaction) => reaction.userId.toString() !== userId,
                );
            }
            // Thêm reaction mới
            message.reactions.push({
                userId: userIdObjectId,
                emojiId: emojiIdObjectId,
            } as any);
        }

        await message.save();

        // Populate và trả về message đã được update
        // userIdObjectId đã được khai báo ở trên
        const populatedMessage = await this.messageModel
            .findById(message._id)
            .populate('senderId', 'username fullName avatarUrl')
            .populate({
                path: 'replyTo',
                select: 'text senderId createdAt updatedAt conversationId _id attachments',
                match: {
                    deletedFor: { $nin: [userIdObjectId] },
                },
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate({
                path: 'storyId',
                select: 'title mediaUrl mediaType userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('reactions.userId', 'username fullName avatarUrl')
            .populate('reactions.emojiId', 'label icon')
            .populate('seenBy.userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!populatedMessage) {
            throw new HttpException('Failed to retrieve updated message', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Transform message sang response format
        return this.transformToMessageResponseDto(populatedMessage);
    }

    // Tính toán index của tin nhắn chưa đọc đầu tiên
    // Messages được sort từ mới nhất đến cũ nhất (createdAt: -1)
    // Tìm tin nhắn chưa đọc đầu tiên từ dưới lên (từ cũ nhất đến mới nhất)
    private async calculateFirstUnreadMessageIndex(
        conversationId: string,
        userId: string,
        unreadCount: number,
    ): Promise<number | undefined> {
        if (unreadCount <= 0) {
            return undefined;
        }

        const userIdObjectId = new Types.ObjectId(userId);
        const conversationObjectId = new Types.ObjectId(conversationId);

        // Tối ưu: Tìm tin nhắn chưa đọc đầu tiên (từ cũ nhất) bằng aggregation
        // Chỉ query tin nhắn chưa đọc, sort từ cũ đến mới, lấy tin nhắn đầu tiên
        const firstUnreadMessage = await this.messageModel
            .aggregate([
                {
                    $match: {
                        conversationId: conversationObjectId,
                        deletedFor: { $nin: [userIdObjectId] },
                        senderId: { $ne: userIdObjectId },
                        $or: [
                            { seenBy: { $exists: false } },
                            { 'seenBy.userId': { $ne: userIdObjectId } },
                        ],
                    },
                },
                {
                    $sort: { createdAt: 1 }, // Sort từ cũ đến mới để lấy tin nhắn đầu tiên
                },
                {
                    $limit: 1, // Chỉ lấy tin nhắn đầu tiên
                },
                {
                    $project: {
                        _id: 1,
                        createdAt: 1,
                    },
                },
            ])
            .exec();

        if (!firstUnreadMessage || firstUnreadMessage.length === 0) {
            return undefined;
        }

        const firstUnreadCreatedAt = firstUnreadMessage[0].createdAt;

        // Đếm số messages mới hơn tin nhắn chưa đọc đầu tiên
        // Đây chính là index của tin nhắn đó trong list (sort từ mới đến cũ)
        const index = await this.messageModel.countDocuments({
            conversationId: conversationObjectId,
            deletedFor: { $nin: [userIdObjectId] },
            createdAt: { $gt: firstUnreadCreatedAt },
        });

        return index;
    }

    // Transform message từ database format sang response format
    private transformMessage(msg: any): any {
        // Transform replyTo: đảm bảo giữ nguyên _id từ database
        let replyTo = null;
        if (msg.replyTo && typeof msg.replyTo === 'object') {
            replyTo = {
                ...msg.replyTo,
                _id: msg.replyTo._id?.toString() || msg.replyTo.toString(),
                conversationId: (msg.replyTo as any).conversationId?.toString(),
            };
        }

        // Transform storyId: trả về thông tin story nếu có
        let story = null;
        if (msg.storyId && typeof msg.storyId === 'object') {
            story = {
                ...msg.storyId,
                _id: msg.storyId._id?.toString() || msg.storyId.toString(),
                userId: msg.storyId.userId ? {
                    ...msg.storyId.userId,
                    _id: msg.storyId.userId._id?.toString() || msg.storyId.userId.toString(),
                } : null,
            };
        }

        // Transform reactions: userId -> user, emojiId -> emoji
        const reactions = msg.reactions?.map((reaction: any) => ({
            user: reaction.userId,
            emoji: reaction.emojiId ? {
                id: reaction.emojiId._id?.toString() || reaction.emojiId.toString(),
                label: reaction.emojiId.label,
                icon: reaction.emojiId.icon,
            } : null,
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
            replyTo,
            story,
            reactions,
            seenBy,
            metadata: msg.metadata || null, // Explicitly include metadata
        };
    }

    // Transform và convert message sang MessageResponseDto
    private transformToMessageResponseDto(msg: any): MessageResponseDto {
        const transformed = this.transformMessage(msg);
        return plainToInstance(MessageResponseDto, transformed, {
            excludeExtraneousValues: true,
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

    // Lấy lịch sử chỉnh sửa của một message
    async getMessageEditLogs(
        messageId: string,
        userId: string,
    ): Promise<MessageEditLogResponseDto[]> {
        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
        }

        // Tìm message để kiểm tra user có quyền xem không
        const message = await this.messageModel.findById(messageId).exec();

        if (!message) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // Kiểm tra user có trong conversation không
        const conversation = await this.conversationModel
            .findOne({
                _id: message.conversationId,
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'You do not have access to this message',
                HttpStatus.FORBIDDEN,
            );
        }

        // Lấy tất cả edit logs của message, sắp xếp từ cũ đến mới
        const editLogs = await this.messageEditLogModel
            .find({ messageId: new Types.ObjectId(messageId) })
            .populate('editedBy', 'username fullName avatarUrl')
            .sort({ editedAt: 1 }) // Sắp xếp từ cũ đến mới
            .lean()
            .exec();

        // Transform logs sang DTO
        const transformedLogs = editLogs.map((log: any) => ({
            _id: log._id.toString(),
            messageId: log.messageId.toString(),
            oldText: log.oldText,
            newText: log.newText,
            editedBy: log.editedBy,
            editedAt: log.editedAt,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt,
        }));

        return plainToInstance(MessageEditLogResponseDto, transformedLogs, {
            excludeExtraneousValues: true,
        });
    }

    // Xóa tin nhắn
    async deleteMessage(
        userId: string,
        deleteMessageDto: DeleteMessageDto,
    ): Promise<MessageResponseDto> {
        const { messageId, deleteForEveryone } = deleteMessageDto;

        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
        }

        // Tìm message
        const message = await this.messageModel.findById(messageId).exec();

        if (!message) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        // Kiểm tra user có trong conversation không
        const conversation = await this.conversationModel
            .findOne({
                _id: message.conversationId,
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'You do not have access to this message',
                HttpStatus.FORBIDDEN,
            );
        }

        if (deleteForEveryone) {
            // Xóa cho mọi người: chỉ người gửi mới có quyền
            if (message.senderId.toString() !== userId) {
                throw new HttpException(
                    'Only the sender can delete message for everyone',
                    HttpStatus.FORBIDDEN,
                );
            }
            // Đánh dấu deletedForEveryone = true
            message.deletedForEveryone = true;
            message.deletedFor = [];
        } else {
            // Xóa cho tôi: thêm userId vào deletedFor array
            const userIdObjectId = new Types.ObjectId(userId);
            if (!message.deletedFor) {
                message.deletedFor = [];
            }
            // Kiểm tra xem đã có trong deletedFor chưa
            const alreadyDeleted = message.deletedFor.some(
                (id) => id.toString() === userId,
            );
            if (!alreadyDeleted) {
                message.deletedFor.push(userIdObjectId);
            }
        }

        await message.save();

        // Populate và trả về message đã được update
        const userIdObjectIdForPopulate = new Types.ObjectId(userId);

        const populatedMessage = await this.messageModel
            .findById(message._id)
            .populate('senderId', 'username fullName avatarUrl')
            .populate({
                path: 'replyTo',
                select: 'text senderId createdAt updatedAt conversationId _id attachments',
                match: {
                    deletedFor: { $nin: [userIdObjectIdForPopulate] },
                },
                populate: {
                    path: 'senderId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate({
                path: 'storyId',
                select: 'title mediaUrl mediaType userId createdAt',
                populate: {
                    path: 'userId',
                    select: 'username fullName avatarUrl'
                }
            })
            .populate('reactions.userId', 'username fullName avatarUrl')
            .populate('reactions.emojiId', 'label icon')
            .populate('seenBy.userId', 'username fullName avatarUrl')
            .lean()
            .exec();

        if (!populatedMessage) {
            throw new HttpException('Failed to retrieve deleted message', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Transform message sang response format
        return this.transformToMessageResponseDto(populatedMessage);
    }

    async getFile(id: string) {
        if (!Types.ObjectId.isValid(id)) return null;
        return this.chatFileModel.findById(id).exec();
    }

    async getSummaryUnread(conversationId: string, userId: string, messages: string[], lang?: string): Promise<{ summary: string }> {
        const isParticipant = await this.checkUserInConversation(conversationId, userId);
        if (!isParticipant) {
            throw new HttpException('You are not a participant in this conversation', HttpStatus.FORBIDDEN);
        }

        if (!messages || messages.length === 0) {
            return { summary: lang?.startsWith('vi') ? 'Không có tin nhắn chưa đọc.' : 'No unread messages.' };
        }

        const messagesText = messages.join('\n');
        const summary = await this.aiService.summarizeMessages(messagesText, lang);
        return { summary };
    }

    async translateMessage(
        messageId: string,
        userId: string,
        targetLang: string = 'en',
    ) {
        if (!Types.ObjectId.isValid(messageId)) {
            throw new HttpException('Invalid message ID', HttpStatus.BAD_REQUEST);
        }

        const message = await this.messageModel.findById(messageId).exec();

        if (!message) {
            throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
        }

        const conversation = await this.conversationModel
            .findOne({
                _id: message.conversationId,
                participants: new Types.ObjectId(userId),
            })
            .exec();

        if (!conversation) {
            throw new HttpException(
                'You do not have access to this message',
                HttpStatus.FORBIDDEN,
            );
        }

        const text = message.text;
        if (!text || !text.trim()) {
            throw new HttpException('Message has no text to translate', HttpStatus.BAD_REQUEST);
        }

        try {
            const detected = await this.googleTranslationService.detectLanguage(text);
            const normalizedTarget = targetLang || 'en';

            if (langsMatch(detected, normalizedTarget)) {
                return {
                    originalText: text,
                    translatedText: text,
                    sourceLang: detected,
                    targetLang: normalizedTarget,
                    translationNotNeeded: true,
                };
            }

            const result = await this.googleTranslationService.translate(text, normalizedTarget);

            return {
                originalText: text,
                translatedText: result.translatedText,
                sourceLang: result.sourceLang,
                targetLang: result.targetLang,
                translationNotNeeded: false,
            };
        } catch (error) {
            console.error(`Failed to translate message ${messageId}:`, error);
            throw new HttpException(
                'Failed to translate message',
                HttpStatus.BAD_GATEWAY,
            );
        }
    }
}
