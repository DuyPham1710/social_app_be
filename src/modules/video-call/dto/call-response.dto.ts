import UserResponseDto from "src/modules/user/dto/user.response.dto";

export class CallResponseDto {
    callId: string;
    channelId: string;
    token: string;
    appId: string;
    callerId: string;
    receiverIds: string[];
    callType: 'video' | 'audio';
    conversationId?: string;
    createdAt: Date;
}

export class CallInviteResponseDto {
    callId: string;
    channelId: string;
    callerId: string;
    callerInfo?: UserResponseDto
    callType: 'video' | 'audio';
    conversationId?: string;
}

