export enum AppEvents {
    // ===== USER =====
    USER_REGISTERED = 'user.registered',
    USER_REGISTER_FAILED = 'user.register.failed',
    USER_FIND_BY_EMAIL = 'user.findByEmail',
    USER_FIND_BY_USERNAME = 'user.findByUsername',
    USER_FIND_ONE = 'user.findOne',
    USER_CREATE = 'user.create',
    USER_CREATED = 'user.created',
    USER_UPDATE = 'user.update',
    USER_UPDATE_REFRESH_TOKEN = 'user.updateRefreshToken',
    USER_VALIDATE_BY_EMAIL = 'user.validateByEmail',
    USER_CHECK_EXISTS = 'user.checkExists',
    USER_GET_BASIC_INFO = 'user.getBasicInfo',

    // ===== MAIL =====
    MAIL_SEND = 'mail.send',

    // ===== ACCOUNT =====
    ACCOUNT_CREATE = 'account.createAccount',

    // ===== FRIENDS =====
    FRIENDS_GET = 'friends.get',

    // ===== POST =====
    POST_CREATED = 'post.created',
    POST_DELETED = 'post.deleted',
    POST_GET_USER_ID = 'post.getUserId',

    // ===== REACT POST =====
    REACT_POST_GET = 'react-post.get',
    REACT_POST_FIND_BY_USER = 'react-post.findByUser',

    // ===== STORY =====
    STORY_CREATED = 'story.created',
    STORY_EXPIRED = 'story.expired',
    STORY_GET_USER_ID = 'story.getUserId',

    // ===== REACT COMMENT =====


    // ===== REACT STORY =====
    REACT_STORY_GET = 'react-story.get',
    REACT_STORY_FIND_BY_USER = 'react-story.findByUser',

    // ===== CHAT =====
    CHAT_SEND_MESSAGE = 'chat.sendMessage',
    REACT_COMMENT_GET = "REACT_COMMENT_GET",
    REACT_COMMENT_FIND_BY_USER = "REACT_COMMENT_FIND_BY_USER",

    //===== COMMENT =====
    COMMENT_GET_USER_ID = 'comment.getUserId',
    USER_GET_FCM_TOKEN = "USER_GET_FCM_TOKEN",
}
