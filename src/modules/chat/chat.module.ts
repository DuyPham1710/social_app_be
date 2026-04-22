import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { VoiceEffectService } from './helpers/voice-effect.service';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { MessageEditLog, MessageEditLogSchema } from './schemas/message-edit-log.schema';
import { PresenceModule } from 'src/shared/presence.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: MessageEditLog.name, schema: MessageEditLogSchema },
    ]),
    PresenceModule,
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, VoiceEffectService],
  exports: [ChatService],
})
export class ChatModule { }
