export enum AppEvents {
    // ===== USER =====
    USER_REGISTERED = 'user.registered',
    USER_REGISTER_FAILED = 'user.register.failed',
    USER_FIND_BY_EMAIL = 'user.findByEmail',
    USER_FIND_BY_USERNAME = 'user.findByUsername',
    USER_FIND_ONE = 'user.findOne',
    USER_CREATE = 'user.create',
    USER_UPDATE = 'user.update',
    USER_UPDATE_REFRESH_TOKEN = 'user.updateRefreshToken',
    USER_VALIDATE_BY_EMAIL = 'user.validateByEmail',
    USER_CHECK_EXISTS = 'user.checkExists',

    // ===== MAIL =====
    MAIL_SEND = 'mail.send',

    // ===== ACCOUNT =====
    ACCOUNT_CREATE = 'account.createAccount',

    // ===== FRIENDS =====
    FRIENDS_GET = 'friends.get',

    // ===== POST =====
    POST_CREATED = 'post.created',
    POST_DELETED = 'post.deleted',

    // ===== REACT POST =====
    REACT_POST_GET = 'react-post.get',
    REACT_POST_FIND_BY_USER = 'react-post.findByUser',

    // ===== STORY =====
    STORY_CREATED = 'story.created',
    STORY_EXPIRED = 'story.expired',
}
