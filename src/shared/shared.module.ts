import { Global, Module } from '@nestjs/common';
import { FcmService } from './services/fcm.service';

@Global()
@Module({
    providers: [FcmService],
    exports: [FcmService],
})
export class SharedModule { }


