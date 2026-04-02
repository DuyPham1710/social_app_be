import { Global, Module } from '@nestjs/common';
import { FcmService } from './services/fcm.service';
import { HttpModule } from '@nestjs/axios';
import { ImageModerationService } from './services/image-moderation.service';
import { TextModerationService } from './services/text-moderation.service';

@Global()
@Module({
    imports: [HttpModule],
    providers: [FcmService, ImageModerationService, TextModerationService],
    exports: [FcmService, ImageModerationService, TextModerationService],
})
export class SharedModule { }
