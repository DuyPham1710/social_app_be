import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VideoCallService } from './video-call.service';
import { CreateCallDto, CreateGroupCallDto, CallInviteResponseDto } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import UserResponseDto from '../user/dto/user.response.dto';
import { FcmService } from 'src/shared/services/fcm.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: '/video-call',
})
export class VideoCallGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // Map để lưu userId -> socketId
    private userSockets = new Map<string, string>();

    // Map để lưu active calls: callId -> { callerId, participantIds, channelId }
    private activeCalls = new Map<string, {
        callerId: string;
        participantIds: string[];
        channelId: string;
        callType: 'video' | 'audio';
        conversationId?: string;
    }>();

    constructor(
        private readonly videoCallService: VideoCallService,
        private readonly eventEmitter: EventEmitter2,
        private readonly fcmService: FcmService,
    ) { }

    async handleConnection(client: Socket) {
        try {
            console.log(`[VideoCall] Client connected: ${client.id}`);

            client.emit('connected', {
                message: 'Connected to video call service. Please send register event with userId.',
                socketId: client.id,
                timestamp: new Date(),
            });
        } catch (error) {
            console.error('[VideoCall] Connection error:', error);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        // Find user by socket ID
        let disconnectedUserId: string | null = null;
        for (const [userId, socketId] of this.userSockets.entries()) {
            if (socketId === client.id) {
                disconnectedUserId = userId;
                this.userSockets.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            // End all active calls for this user
            this.endAllCallsForUser(disconnectedUserId);
            console.log(`[VideoCall] Client disconnected: ${client.id} - User: ${disconnectedUserId}`);
        } else {
            console.log(`[VideoCall] Client disconnected: ${client.id} - Unknown user`);
        }
    }

    // User register với userId sau khi connect
    @SubscribeMessage('register')
    async handleRegister(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; username?: string },
    ) {
        try {
            const { userId, username } = data;

            if (!userId || userId.trim() === '') {
                client.emit('error', {
                    message: 'userId is required',
                    event: 'register',
                });
                return;
            }

            // Set user socket mapping
            this.userSockets.set(userId.trim(), client.id);

            console.log(`[VideoCall] User registered: ${userId} (${username || 'Unknown'}) - Socket: ${client.id}`);

            // Emit registration success
            client.emit('register:ack', {
                message: 'Successfully registered',
                userId,
                username,
                socketId: client.id,
                timestamp: new Date(),
            });

            return { success: true };
        } catch (error) {
            console.error('[VideoCall] Register error:', error);
            client.emit('error', {
                message: 'Failed to register user',
                event: 'register',
            });
        }
    }

    // Create 1-1 call
    @SubscribeMessage('call:invite')
    async handleCallInvite(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string } & CreateCallDto,
    ) {
        try {
            const { userId, ...createCallDto } = data;

            if (!userId) {
                client.emit('error', {
                    message: 'userId is required',
                    event: 'call:invite',
                });
                return;
            }

            // Create call and generate token
            const callResponse = await this.videoCallService.createCall(userId, createCallDto);

            // Store active call
            this.activeCalls.set(callResponse.callId, {
                callerId: userId,
                participantIds: callResponse.receiverIds,
                channelId: callResponse.channelId,
                callType: callResponse.callType,
                conversationId: callResponse.conversationId,
            });

            // Get caller info
            const [callerInfo] = await this.eventEmitter.emitAsync(AppEvents.USER_GET_BASIC_INFO, { userId });

            // Send call invitation to receiver(s)
            const inviteData: CallInviteResponseDto = {
                callId: callResponse.callId,
                channelId: callResponse.channelId,
                callerId: userId,
                callerInfo: callerInfo as UserResponseDto || undefined,
                callType: callResponse.callType,
                conversationId: callResponse.conversationId,
            };

            // Emit to receiver(s) - check if online first
            callResponse.receiverIds.forEach((receiverId) => {
                // const isOnline = this.userSockets.has(receiverId);

                // if (isOnline) {
                //     // User is online - send via socket
                //     this.sendToUser(receiverId, 'call:incoming', inviteData);
                // } else {
                // User is offline - send push notification
                this.sendPushNotificationForCall(receiverId, inviteData, callerInfo);
                // }
            });

            // Send call created response to caller with token
            client.emit('call:created', {
                ...callResponse,
                callerInfo: callerInfo as UserResponseDto || undefined,
            });

            console.log(`[VideoCall] Call ${callResponse.callId} created by ${userId} to ${callResponse.receiverIds.join(', ')}`);

            return { success: true, callId: callResponse.callId };
        } catch (error) {
            console.error('[VideoCall] Call invite error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to create call',
                event: 'call:invite',
            });
            return { error: error?.message || 'Failed to create call' };
        }
    }

    // Create group call
    @SubscribeMessage('call:invite-group')
    async handleGroupCallInvite(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string } & CreateGroupCallDto,
    ) {
        try {
            const { userId, ...createGroupCallDto } = data;

            if (!userId) {
                client.emit('error', {
                    message: 'userId is required',
                    event: 'call:invite-group',
                });
                return;
            }

            // Create call and generate token
            const callResponse = await this.videoCallService.createCall(userId, createGroupCallDto);

            // Store active call
            this.activeCalls.set(callResponse.callId, {
                callerId: userId,
                participantIds: callResponse.receiverIds,
                channelId: callResponse.channelId,
                callType: callResponse.callType,
                conversationId: callResponse.conversationId,
            });

            // Get caller info
            const [callerInfo] = await this.eventEmitter.emitAsync(AppEvents.USER_GET_BASIC_INFO, { userId });

            // Send call invitation to all participants
            const inviteData: CallInviteResponseDto = {
                callId: callResponse.callId,
                channelId: callResponse.channelId,
                callerId: userId,
                callerInfo: callerInfo as UserResponseDto || undefined,
                callType: callResponse.callType,
                conversationId: callResponse.conversationId,
            };

            // Emit to all participants - check if online first
            callResponse.receiverIds.forEach((participantId) => {
                // const isOnline = this.userSockets.has(participantId);

                // if (isOnline) {
                //     // User is online - send via socket
                //     this.sendToUser(participantId, 'call:incoming', inviteData);
                // } else {
                // User is offline - send push notification
                this.sendPushNotificationForCall(participantId, inviteData, callerInfo);
                // }
            });

            // Send call created response to caller with token
            client.emit('call:created', {
                ...callResponse,
                callerInfo: callerInfo as UserResponseDto || undefined,
            });

            console.log(`[VideoCall] Group call ${callResponse.callId} created by ${userId} with ${callResponse.receiverIds.length} participants`);

            return { success: true, callId: callResponse.callId };
        } catch (error) {
            console.error('[VideoCall] Group call invite error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to create group call',
                event: 'call:invite-group',
            });
            return { error: error?.message || 'Failed to create group call' };
        }
    }

    // Accept call
    @SubscribeMessage('call:accept')
    async handleCallAccept(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; callId: string },
    ) {
        try {
            const { userId, callId } = data;

            if (!userId || !callId) {
                client.emit('error', {
                    message: 'userId and callId are required',
                    event: 'call:accept',
                });
                return;
            }

            const activeCall = this.activeCalls.get(callId);
            if (!activeCall) {
                client.emit('error', {
                    message: 'Call not found or already ended',
                    event: 'call:accept',
                });
                return;
            }

            // Check if user is a participant
            if (!activeCall.participantIds.includes(userId) && activeCall.callerId !== userId) {
                client.emit('error', {
                    message: 'You are not a participant of this call',
                    event: 'call:accept',
                });
                return;
            }

            // Update call status
            await this.videoCallService.updateCallStatus(activeCall.channelId, 'answered', userId);

            // Generate token for the user
            const tokenData = await this.videoCallService.getTokenForCall(activeCall.channelId, userId);

            // Get caller info for the receiver to display
            const [callerInfo] = await this.eventEmitter.emitAsync(AppEvents.USER_GET_BASIC_INFO, { userId: activeCall.callerId });

            // Notify caller and other participants
            this.sendToUser(activeCall.callerId, 'call:accepted', {
                callId,
                acceptedBy: userId,
                ...tokenData,
            });

            // Send token to the user who accepted (include caller info for display)
            client.emit('call:accepted', {
                callId,
                ...tokenData,
                callerInfo: callerInfo as UserResponseDto || undefined,
                callerId: activeCall.callerId,
                callType: activeCall.callType,
                conversationId: activeCall.conversationId,
            });

            // Notify all participants that someone joined
            activeCall.participantIds.forEach((participantId) => {
                if (participantId !== userId) {
                    this.sendToUser(participantId, 'call:participant-joined', {
                        callId,
                        channelId: activeCall.channelId,
                        userId,
                    });
                }
            });

            console.log(`[VideoCall] Call ${callId} accepted by ${userId}`);

            return { success: true, ...tokenData };
        } catch (error) {
            console.error('[VideoCall] Call accept error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to accept call',
                event: 'call:accept',
            });
            return { error: error?.message || 'Failed to accept call' };
        }
    }

    // Reject call
    @SubscribeMessage('call:reject')
    async handleCallReject(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; callId: string },
    ) {
        try {
            const { userId, callId } = data;

            if (!userId || !callId) {
                client.emit('error', {
                    message: 'userId and callId are required',
                    event: 'call:reject',
                });
                return;
            }

            const activeCall = this.activeCalls.get(callId);
            if (!activeCall) {
                return { success: true }; // Call already ended
            }

            // Update call status
            await this.videoCallService.updateCallStatus(activeCall.channelId, 'rejected', userId);

            // Notify caller
            this.sendToUser(activeCall.callerId, 'call:rejected', {
                callId,
                channelId: activeCall.channelId,
                rejectedBy: userId,
            });

            // Send call summary message to conversation (if conversationId exists)
            if (activeCall.conversationId) {
                await this.sendCallSummaryMessage({
                    callerId: activeCall.callerId,
                    conversationId: activeCall.conversationId,
                    callType: activeCall.callType,
                    callStatus: 'rejected',
                    duration: 0,
                    callId,
                });
            }

            // Remove from active calls
            this.activeCalls.delete(callId);

            console.log(`[VideoCall] Call ${callId} rejected by ${userId}`);

            return { success: true };
        } catch (error) {
            console.error('[VideoCall] Call reject error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to reject call',
                event: 'call:reject',
            });
            return { error: error?.message || 'Failed to reject call' };
        }
    }

    // End call
    @SubscribeMessage('call:end')
    async handleCallEnd(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; callId: string; duration?: number; callStatus?: string },
    ) {
        try {
            const { userId, callId, duration, callStatus } = data;

            if (!userId || !callId) {
                client.emit('error', {
                    message: 'userId and callId are required',
                    event: 'call:end',
                });
                return;
            }

            const activeCall = this.activeCalls.get(callId);
            if (!activeCall) {
                // Call already ended - this happens when the other party already called end
                // Don't send duplicate message or notifications
                console.log(`[VideoCall] Call ${callId} already ended, ignoring duplicate end request from ${userId}`);
                return { success: true };
            }

            // Determine call status
            // If duration exists or callStatus is 'completed', it's a completed call
            // If duration = 0 and no callStatus, it's missed (caller ended before receiver picked up)
            let finalCallStatus: 'completed' | 'missed' | 'rejected' = callStatus as any || 'completed';
            if (!duration || duration === 0) {
                // No duration means call wasn't answered
                finalCallStatus = 'missed';
            }

            this.activeCalls.delete(callId);

            // Update call status
            await this.videoCallService.updateCallStatus(activeCall.channelId, 'ended', userId);

            // Notify all participants via socket
            const allParticipants = [activeCall.callerId, ...activeCall.participantIds];
            allParticipants.forEach((participantId) => {
                this.sendToUser(participantId, 'call:ended', {
                    callId,
                    channelId: activeCall.channelId,
                    endedBy: userId,
                    callStatus: finalCallStatus, // Add status to event
                });
            });

            // Send FCM notification to dismiss CallKit UI for all participants
            const reason: 'missed' | 'rejected' | 'ended' =
                (finalCallStatus === 'missed' || (!duration || duration === 0))
                    ? 'missed'
                    : 'ended';

            // Send to all participants (receivers) who didn't end the call
            for (const participantId of activeCall.participantIds) {
                if (participantId !== userId) {
                    await this.sendCallEndedNotification(participantId, callId, reason);
                }
            }

            // Send call summary message to conversation (if conversationId exists)
            if (activeCall.conversationId) {
                await this.sendCallSummaryMessage({
                    callerId: activeCall.callerId,
                    conversationId: activeCall.conversationId,
                    callType: activeCall.callType,
                    callStatus: finalCallStatus, // Use determined status
                    duration: duration || 0,
                    callId,
                });
            }

            console.log(`[VideoCall] Call ${callId} ended by ${userId} with status: ${finalCallStatus}`);

            return { success: true };
        } catch (error) {
            console.error('[VideoCall] Call end error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to end call',
                event: 'call:end',
            });
            return { error: error?.message || 'Failed to end call' };
        }
    }

    // Get token for existing call
    @SubscribeMessage('call:get-token')
    async handleGetToken(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { userId: string; channelId: string },
    ) {
        try {
            const { userId, channelId } = data;

            if (!userId || !channelId) {
                client.emit('error', {
                    message: 'userId and channelId are required',
                    event: 'call:get-token',
                });
                return;
            }

            const tokenData = await this.videoCallService.getTokenForCall(channelId, userId);

            client.emit('call:token', tokenData);

            return { success: true, ...tokenData };
        } catch (error) {
            console.error('[VideoCall] Get token error:', error);
            client.emit('error', {
                message: error?.message || 'Failed to get token',
                event: 'call:get-token',
            });
            return { error: error?.message || 'Failed to get token' };
        }
    }

    // Helper method để gửi tin nhắn đến một user cụ thể
    private sendToUser(userId: string, event: string, data: any) {
        const socketId = this.userSockets.get(userId);
        if (socketId) {
            this.server.to(socketId).emit(event, data);
        }
    }

    // Helper method để gửi push notification cho incoming call
    private async sendPushNotificationForCall(
        receiverId: string,
        inviteData: CallInviteResponseDto,
        callerInfo?: any,
    ) {
        try {
            // Get user's FCM token from database
            const [userData] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_ONE, { userId: receiverId });

            if (!userData || !userData.fcmToken) {
                console.log(`[VideoCall] User ${receiverId} has no FCM token, cannot send push notification`);
                return;
            }

            console.log(`[VideoCall] Sending push notification to ${receiverId} for call ${inviteData.callId}`);

            // Send FCM notification
            await this.fcmService.sendIncomingCallNotification({
                fcmToken: userData.fcmToken,
                callId: inviteData.callId,
                callerId: inviteData.callerId,
                callerName: callerInfo?.fullName || callerInfo?.username || 'Someone',
                callerAvatar: callerInfo?.avatarUrl,
                callType: inviteData.callType,
                channelId: inviteData.channelId,
                receiverId: receiverId,
            });

            console.log(`[VideoCall] Push notification sent successfully to ${receiverId}`);
        } catch (error) {
            console.error(`[VideoCall] Failed to send push notification to ${receiverId}:`, error);
        }
    }

    // Helper method để gửi FCM notification khi call ended
    private async sendCallEndedNotification(
        receiverId: string,
        callId: string,
        reason: 'missed' | 'rejected' | 'ended',
    ) {
        try {
            // Get user's FCM token from database
            const [userData] = await this.eventEmitter.emitAsync(AppEvents.USER_FIND_ONE, { userId: receiverId });

            if (!userData || !userData.fcmToken) {
                console.log(`[VideoCall] User ${receiverId} has no FCM token, cannot send call ended notification`);
                return;
            }

            console.log(`[VideoCall] Sending call ended notification to ${receiverId} for call ${callId}`);

            // Send FCM notification
            await this.fcmService.sendCallEndedNotification({
                fcmToken: userData.fcmToken,
                callId: callId,
                reason: reason,
            });

            console.log(`[VideoCall] Call ended notification sent successfully to ${receiverId}`);
        } catch (error) {
            console.error(`[VideoCall] Failed to send call ended notification to ${receiverId}:`, error);
        }
    }

    // Helper method để end all calls for a user
    private async endAllCallsForUser(userId: string) {
        const callsToEnd: string[] = [];

        this.activeCalls.forEach((call, callId) => {
            if (call.callerId === userId || call.participantIds.includes(userId)) {
                callsToEnd.push(callId);
            }
        });

        for (const callId of callsToEnd) {
            const call = this.activeCalls.get(callId);
            if (call) {
                await this.videoCallService.updateCallStatus(call.channelId, 'ended', userId);
                this.activeCalls.delete(callId);

                // Notify all participants
                const allParticipants = [call.callerId, ...call.participantIds];
                allParticipants.forEach((participantId) => {
                    if (participantId !== userId) {
                        this.sendToUser(participantId, 'call:ended', {
                            callId,
                            channelId: call.channelId,
                            endedBy: userId,
                            reason: 'user_disconnected',
                        });
                    }
                });
            }
        }
    }

    // Helper method to send call summary message
    private async sendCallSummaryMessage(data: {
        callerId: string;
        conversationId: string;
        callType: 'video' | 'audio';
        callStatus: 'completed' | 'missed' | 'rejected';
        duration: number;
        callId: string;
    }) {
        try {
            console.log('[VideoCall] Sending call summary message:', data);

            // Format message text based on call status
            let messageText = '';
            if (data.callStatus === 'completed' && data.duration > 0) {
                const minutes = Math.floor(data.duration / 60);
                const seconds = data.duration % 60;
                const durationText = minutes > 0
                    ? `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                    : `0:${seconds.toString().padStart(2, '0')}`;
                messageText = `Cuộc gọi ${data.callType === 'video' ? 'video' : 'thoại'} đã kết thúc. Thời lượng: ${durationText}`;
            } else if (data.callStatus === 'rejected') {
                messageText = `Đã bỏ lỡ cuộc gọi ${data.callType === 'video' ? 'video' : 'thoại'}`;
            } else {
                messageText = `Nhỡ cuộc gọi ${data.callType === 'video' ? 'video' : 'thoại'}`;
            }

            // Emit event to chat gateway
            await this.eventEmitter.emitAsync(AppEvents.CHAT_SEND_MESSAGE, {
                userId: data.callerId,
                conversationId: data.conversationId,
                text: messageText,
                metadata: {
                    type: data.callType === 'video' ? 'video_call' : 'audio_call',
                    callStatus: data.callStatus,
                    duration: data.duration,
                    callId: data.callId,
                },
            });

            console.log('[VideoCall] Call summary message event emitted successfully');
        } catch (error) {
            console.error('[VideoCall] Error sending call summary message:', error);
        }
    }
}

