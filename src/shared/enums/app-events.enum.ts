export enum AppEvents {
    // ===== USER =====
    USER_REGISTERED = 'user.registered',
    USER_REGISTER_FAILED = 'user.register.failed',

    // ===== ACCOUNT =====
    ACCOUNT_CREATE = 'account.createAccount',

    // ===== FRIENDS =====
    FRIENDS_GET = 'friends.get',

    // ===== POST =====
    POST_CREATED = 'post.created',
    POST_DELETED = 'post.deleted',

    // ===== STORY =====
    STORY_CREATED = 'story.created',
    STORY_EXPIRED = 'story.expired',
}
