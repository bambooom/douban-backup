import {type DB_PROPERTIES_KEYS, ItemStatus, NotionPropTypesEnum} from './types';

export const ALL_STATUS = /^(?:最近)?(看过|听过|读过|玩过|在看|在听|在读|在玩|想看|想听|想读|想玩)/;

export const RATING_TEXT = {
    很差: 1,
    较差: 2,
    还行: 3,
    推荐: 4,
    力荐: 5,
};

export const SeeState = {
    '看过': ItemStatus.Complete,
    '在看': ItemStatus.Progress,
    '想看': ItemStatus.Wishlist,
};

export const ReadState = {
    '读过': ItemStatus.Complete,
    '在读': ItemStatus.Progress,
    '想读': ItemStatus.Wishlist,
};

export const PlayState = {
    '玩过': ItemStatus.Complete,
    '在玩': ItemStatus.Progress,
    '想玩': ItemStatus.Wishlist,
};

export const ListenState = {
    '听过': ItemStatus.Complete,
    '在听': ItemStatus.Progress,
    '想听': ItemStatus.Wishlist,
};

export const PropertyTypeMap: Record<DB_PROPERTIES_KEYS, NotionPropTypesEnum> = {
    POSTER: NotionPropTypesEnum.FILES,
    MOVIE_TITLE: NotionPropTypesEnum.TITLE,
    MUSIC_TITLE: NotionPropTypesEnum.TITLE,
    BOOK_TITLE: NotionPropTypesEnum.TITLE,
    GAME_TITLE: NotionPropTypesEnum.TITLE,
    DRAMA_TITLE: NotionPropTypesEnum.TITLE,
    COVER: NotionPropTypesEnum.FILES,
    RATING: NotionPropTypesEnum.MULTI_SELECT,
    RATING_DATE: NotionPropTypesEnum.DATE,
    COMMENTS: NotionPropTypesEnum.RICH_TEXT,
    YEAR: NotionPropTypesEnum.NUMBER,
    DIRECTORS: NotionPropTypesEnum.RICH_TEXT,
    SCREENWRITERS: NotionPropTypesEnum.RICH_TEXT,
    ACTORS: NotionPropTypesEnum.RICH_TEXT,
    GENRE: NotionPropTypesEnum.MULTI_SELECT,
    ITEM_LINK: NotionPropTypesEnum.URL,
    IMDB_LINK: NotionPropTypesEnum.URL,
    RELEASE_DATE: NotionPropTypesEnum.DATE,
    MUSICIAN: NotionPropTypesEnum.RICH_TEXT,
    PUBLICATION_DATE: NotionPropTypesEnum.DATE,
    PUBLISHING_HOUSE: NotionPropTypesEnum.RICH_TEXT,
    WRITER: NotionPropTypesEnum.RICH_TEXT,
    ISBN: NotionPropTypesEnum.NUMBER,
    TITLE: NotionPropTypesEnum.TITLE,
    PRODUCTION: NotionPropTypesEnum.RICH_TEXT,
    STATUS: NotionPropTypesEnum.SELECT,
    MEDIA_TYPE: NotionPropTypesEnum.SELECT,
    SYNOPSIS: NotionPropTypesEnum.RICH_TEXT,
    publishDatetime: NotionPropTypesEnum.DATE,
    BOOK_DESCRIPTION: NotionPropTypesEnum.RICH_TEXT,
    AUTHOR_DESC: NotionPropTypesEnum.RICH_TEXT,
    TRANSLATOR: NotionPropTypesEnum.RICH_TEXT,
    ORIGINAL_TITLE: NotionPropTypesEnum.RICH_TEXT,
    START_TIME: NotionPropTypesEnum.DATE
};

export const EMOJI = {
    movie: '🎞',
    music: '🎶',
    book: '📖',
    game: '🕹',
    drama: '💃🏻',
};
