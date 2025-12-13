import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { CallHistory, CallHistoryDocument } from './schemas/call-history.schema';
import { CreateCallDto, CreateGroupCallDto, CallResponseDto } from './dto';

@Injectable()
export class VideoCallService {
    private readonly appId: string | undefined;
    private readonly appCertificate: string | undefined;
    private readonly tokenExpirationTime: number = 3600; // 1 hour

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(CallHistory.name) private readonly callHistoryModel: Model<CallHistoryDocument>,
    ) {
        this.appId = this.configService.get<string>('AGORA_APP_ID');
        this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE');

        if (!this.appId || !this.appCertificate) {
            console.warn('⚠️  Agora credentials not found. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env');
        }
    }

    /**
     * Generate Agora RTC token for a user
     */
    generateToken(
        channelId: string,
        userId: string | number,
        role: number = RtcRole.PUBLISHER,
    ): string {
        if (!this.appId || !this.appCertificate) {
            throw new HttpException(
                'Agora credentials not configured',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const tokenExpire = currentTimestamp + this.tokenExpirationTime;
        const privilegeExpire = currentTimestamp + this.tokenExpirationTime;

        // Convert userId to number if it's a string
        const uid = typeof userId === 'string' ? parseInt(userId.replace(/\D/g, ''), 10) || 0 : userId;

        const token = RtcTokenBuilder.buildTokenWithUid(
            this.appId,
            this.appCertificate,
            channelId,
            uid,
            role,
            tokenExpire,
            privilegeExpire,
        );

        return token;
    }

    /**
     * Generate tokens for multiple users (group call)
     */
    generateTokensForUsers(
        channelId: string,
        userIds: string[],
    ): Map<string, string> {
        const tokens = new Map<string, string>();

        userIds.forEach((userId) => {
            const token = this.generateToken(channelId, userId);
            tokens.set(userId, token);
        });

        return tokens;
    }

    /**
     * Create a call (1-1 or group)
     */
    async createCall(
        callerId: string,
        createCallDto: CreateCallDto | CreateGroupCallDto,
    ): Promise<CallResponseDto> {
        // Generate unique channel ID
        const channelId = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const callId = channelId;

        // Determine participants
        let participantIds: string[];
        if ('receiverId' in createCallDto) {
            // 1-1 call
            participantIds = [callerId, createCallDto.receiverId];
        } else {
            // Group call
            participantIds = [callerId, ...createCallDto.participantIds];
        }

        // Generate token for caller
        const token = this.generateToken(channelId, callerId);

        // Create call history record
        const callHistory = new this.callHistoryModel({
            callerId: new Types.ObjectId(callerId),
            participantIds: participantIds.map((id) => new Types.ObjectId(id)),
            channelId,
            callType: createCallDto.callType,
            conversationId: createCallDto.conversationId
                ? new Types.ObjectId(createCallDto.conversationId)
                : undefined,
            status: 'initiated',
        });

        await callHistory.save();

        if (!this.appId) {
            throw new HttpException(
                'Agora credentials not configured',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        return {
            callId,
            channelId,
            token,
            appId: this.appId,
            callerId,
            receiverIds: participantIds.filter((id) => id !== callerId),
            callType: createCallDto.callType,
            conversationId: createCallDto.conversationId,
            createdAt: new Date(),
        };
    }

    /**
     * Get call history for a user
     */
    async getCallHistory(
        userId: string,
        page: number = 1,
        limit: number = 20,
    ) {
        const skip = (page - 1) * limit;

        const [calls, total] = await Promise.all([
            this.callHistoryModel
                .find({
                    $or: [
                        { callerId: new Types.ObjectId(userId) },
                        { participantIds: new Types.ObjectId(userId) },
                    ],
                })
                .populate('callerId', 'username fullName avatarUrl')
                .populate('participantIds', 'username fullName avatarUrl')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.callHistoryModel.countDocuments({
                $or: [
                    { callerId: new Types.ObjectId(userId) },
                    { participantIds: new Types.ObjectId(userId) },
                ],
            }),
        ]);

        return {
            data: calls,
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalItems: total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update call status
     */
    async updateCallStatus(
        channelId: string,
        status: 'ringing' | 'answered' | 'rejected' | 'ended' | 'missed',
        userId?: string,
    ) {
        const updateData: any = { status };

        if (status === 'answered') {
            updateData.startedAt = new Date();
        }

        if (status === 'ended' || status === 'missed') {
            updateData.endedAt = new Date();

            // Calculate duration if call was answered
            const call = await this.callHistoryModel.findOne({ channelId });
            if (call && call.startedAt) {
                const duration = Math.floor(
                    (new Date().getTime() - call.startedAt.getTime()) / 1000,
                );
                updateData.duration = duration;
            }
        }

        await this.callHistoryModel.updateOne({ channelId }, updateData);
    }

    /**
     * Get token for existing call
     */
    async getTokenForCall(
        channelId: string,
        userId: string,
    ): Promise<{ token: string; appId: string; channelId: string }> {
        if (!this.appId) {
            throw new HttpException(
                'Agora credentials not configured',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        const token = this.generateToken(channelId, userId);

        return {
            token,
            appId: this.appId!,
            channelId,
        };
    }
}

