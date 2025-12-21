import { Types } from 'mongoose';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export class PrivacyUtil {
    static applyPrivacy<T extends { privacy_type: any; friends_except?: any; friends_detail?: any }>(
        entity: T,
        dto: UpdatePrivacyDto,
    ): T {
        entity.privacy_type = dto.privacy_type;

        if (dto.privacy_type === PrivacyType.FRIENDS_EXCEPT) {

            if (dto.friends_except && dto.friends_except.length > 0) {
                entity.friends_except = dto.friends_except.map(id => new Types.ObjectId(id));
            } else {

                entity.friends_except = [];
            }

            (entity as any).friends_detail = undefined;
        } else if (dto.privacy_type === PrivacyType.FRIENDS_DETAIL) {

            if (dto.friends_detail && dto.friends_detail.length > 0) {
                entity.friends_detail = dto.friends_detail.map(id => new Types.ObjectId(id));
            } else {

                entity.friends_detail = [];
            }

            (entity as any).friends_except = undefined;
        } else {

            (entity as any).friends_except = undefined;
            (entity as any).friends_detail = undefined;
        }

        return entity;
    }

    static canView(
        viewerId: Types.ObjectId,
        post: any,
        friendsOfOwner: Types.ObjectId[], // danh sách bạn bè của chủ post
    ): boolean {
        const { userId, privacy_type, friends_except = [], friends_detail = [] } = post;

        // 1. Public: ai cũng xem được
        if (privacy_type === PrivacyType.PUBLIC) {
            return true;
        }

        // 2. Private: chỉ chủ post
        if (privacy_type === PrivacyType.PRIVATE) {
            return viewerId.equals(userId);
        }

        // 3. Friends: chỉ bạn bè
        if (privacy_type === PrivacyType.FRIENDS) {
            return viewerId.equals(userId) || friendsOfOwner.some(f => f.equals(viewerId));
        }

        // 4. Friends_except: bạn bè trừ list
        if (privacy_type === PrivacyType.FRIENDS_EXCEPT) {
            return (
                (viewerId.equals(userId) || friendsOfOwner.some(f => f.equals(viewerId))) &&
                !friends_except.some(f => f.equals(viewerId))
            );
        }

        // 5. Friends_detail: chỉ một số bạn bè được xem
        if (privacy_type === PrivacyType.FRIENDS_DETAIL) {
            return viewerId.equals(userId) || friends_detail.some(f => f.equals(viewerId));
        }

        return false;
    }
}
