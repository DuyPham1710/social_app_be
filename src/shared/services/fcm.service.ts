import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
    private readonly logger = new Logger(FcmService.name);

    onModuleInit() {
        try {
            // Check if already initialized
            if (admin.apps.length === 0) {
                const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

                if (!serviceAccount) {
                    this.logger.warn(
                        'FIREBASE_SERVICE_ACCOUNT_PATH not set. FCM notifications will not work.',
                    );
                    return;
                }

                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });

                this.logger.log('Firebase Admin initialized successfully');
            }
        } catch (error) {
            this.logger.error('Failed to initialize Firebase Admin:', error);
        }
    }

    // Send incoming call notification
    async sendIncomingCallNotification(data: {
        fcmToken: string;
        callId: string;
        callerId: string;
        callerName: string;
        callerAvatar?: string;
        callType: 'video' | 'audio';
        channelId: string;
        receiverId: string;
    }): Promise<boolean> {
        try {
            if (admin.apps.length === 0) {
                this.logger.warn('Firebase not initialized, skipping FCM');
                return false;
            }

            const message: admin.messaging.Message = {
                token: data.fcmToken,
                data: {
                    type: 'incoming_call',
                    callId: data.callId,
                    callerId: data.callerId,
                    callerName: data.callerName,
                    callerAvatar: data.callerAvatar || '',
                    callType: data.callType,
                    channelId: data.channelId,
                    receiverId: data.receiverId,
                },
                android: {
                    priority: 'high',
                    ttl: 30000, // 30 seconds
                    notification: {
                        channelId: 'incoming_call',
                        priority: 'max',
                        sound: 'default',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                        'apns-expiration': String(
                            Math.floor(Date.now() / 1000) + 30,
                        ),
                    },
                    payload: {
                        aps: {
                            alert: {
                                title: `${data.callType === 'video' ? 'Video' : 'Audio'} Call`,
                                body: `${data.callerName} is calling you...`,
                            },
                            sound: 'default',
                            badge: 1,
                            'content-available': 1,
                            category: 'CALL',
                        },
                    },
                },
            };

            const response = await admin.messaging().send(message);
            this.logger.log(
                `FCM notification sent successfully: ${response}`,
            );
            return true;
        } catch (error) {
            this.logger.error('Failed to send FCM notification:', error);
            return false;
        }
    }

    // Send call ended notification
    async sendCallEndedNotification(data: {
        fcmToken: string;
        callId: string;
        reason: 'missed' | 'rejected' | 'ended';
    }): Promise<boolean> {
        try {
            if (admin.apps.length === 0) {
                this.logger.warn('Firebase not initialized, skipping FCM');
                return false;
            }

            const message: admin.messaging.Message = {
                token: data.fcmToken,
                data: {
                    type: 'call_ended',
                    callId: data.callId,
                    reason: data.reason,
                },
            };

            await admin.messaging().send(message);
            this.logger.log(`Call ended notification sent`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send call ended notification:', error);
            return false;
        }
    }

    // Send new message notification
    async sendMessageNotification(data: {
        fcmToken: string;
        conversationId: string;
        messageId: string;
        senderId: string;
        senderName: string;
        senderAvatar?: string;
        messageText: string;
        receiverId: string;
        unreadCount?: number;
        firstUnreadMessageIndex?: number;
    }): Promise<boolean> {
        try {
            if (admin.apps.length === 0) {
                this.logger.warn('Firebase not initialized, skipping FCM');
                return false;
            }

            // Truncate message text if too long
            const truncatedText = data.messageText.length > 100
                ? data.messageText.substring(0, 100) + '...'
                : data.messageText;

            const message: admin.messaging.Message = {
                token: data.fcmToken,
                data: {
                    type: 'new_message',
                    conversationId: data.conversationId,
                    messageId: data.messageId,
                    senderId: data.senderId,
                    senderName: data.senderName,
                    senderAvatar: data.senderAvatar || '',
                    messageText: truncatedText,
                    receiverId: data.receiverId,
                    unreadCount: String(data.unreadCount ?? 0),
                    firstUnreadMessageIndex: String(data.firstUnreadMessageIndex ?? -1),
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'chat_messages',
                        priority: 'high',
                        sound: 'default',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        title: data.senderName,
                        body: truncatedText,
                        imageUrl: data.senderAvatar, // Avatar image for notification
                    },
                },
            };

            const response = await admin.messaging().send(message);
            this.logger.log(
                `Message notification sent successfully: ${response}`,
            );
            return true;
        } catch (error) {
            this.logger.error('Failed to send message notification:', error);
            return false;
        }
    }

    async sendAppNotification(params: {
    fcmToken: string;
    type: string;
    notificationId: string;
    targetId?: string;
    senderId?: string;
    senderName: string;
    senderAvatar?: string;
    message: string;
    content?: string;
}): Promise<boolean> {
    try {
        if (admin.apps.length === 0) {
            this.logger.warn('Firebase not initialized, skipping FCM');
            return false;
        }

        const {
            fcmToken,
            type,
            notificationId,
            targetId,
            senderId,
            senderName,
            senderAvatar,
            message,
            content,
        } = params;

        // Build FCM message
        const fcmMessage: admin.messaging.Message = {
            token: fcmToken,
            // Data payload - ALL values must be strings
            data: {
                type: type,
                notificationId: notificationId,
                targetId: targetId || '',
                senderId: senderId || '',
                senderName: senderName,
                senderAvatar: senderAvatar || '',
                message: message,
                content: content || '',
            },
            // Android specific configuration
            android: {
                priority: 'high',
            },
            // iOS specific configuration
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        'content-available': 1,
                    },
                },
            },
        };

        // Send notification
        const response = await admin.messaging().send(fcmMessage);
        this.logger.log(
            `App notification sent successfully. MessageId: ${response}`,
        );
        return true;
    } catch (error) {
        this.logger.error(
            `Failed to send app notification: ${error.message}`,
            error.stack,
        );
        return false;
    }
}
}


