import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { VoiceEffectService } from './helpers/voice-effect.service';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { MessageEditLog, MessageEditLogSchema } from './schemas/message-edit-log.schema';
import { ChatFile, ChatFileSchema } from './schemas/chat-file.schema';
import { PresenceModule } from 'src/shared/presence.module';
import { Story, StorySchema } from 'src/modules/story/schemas/story.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: MessageEditLog.name, schema: MessageEditLogSchema },
      { name: ChatFile.name, schema: ChatFileSchema },
      { name: Story.name, schema: StorySchema },
    ]),
    PresenceModule,
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, VoiceEffectService],
  exports: [ChatService],
})
export class ChatModule { }
