import { Global, Module } from '@nestjs/common';
import { FcmService } from './services/fcm.service';
import { HttpModule } from '@nestjs/axios';
import { ImageModerationService } from './services/image-moderation.service';
import { TextModerationService } from './services/text-moderation.service';
import { FaceRecognitionService } from './services/face-recognition.service';
import { FaceRecognitionListener } from './listeners/face-recognition.listener';
import { AiService } from './services/ai.service';

@Global()
@Module({
    imports: [HttpModule],
    providers: [FcmService, ImageModerationService, TextModerationService, FaceRecognitionService, FaceRecognitionListener, AiService],
    exports: [FcmService, ImageModerationService, TextModerationService, FaceRecognitionService, AiService],
})
export class SharedModule { }
