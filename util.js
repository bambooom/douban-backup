export const DB_PROPERTIES = {
  NAME: 'name', // 用于log
  // movie
  POSTER: '海报',
  MOVIE_TITLE: '电影/电视剧/番组',
  YEAR: '上映年份',
  DIRECTORS: '导演',
  ACTORS: '主演',
  GENRE: '类型', // movie, game, drama
  IMDB_LINK: 'IMDb 链接',
  // music
  COVER: '封面', // music, book, game
  MUSIC_TITLE: '单曲/专辑',
  RELEASE_DATE: '发行日期', // music and game
  MUSICIAN: '音乐家',
  // book
  BOOK_TITLE: '书名',
  PUBLICATION_DATE: '出版日期',
  PUBLISHING_HOUSE: '出版社',
  WRITER: '作者',
  ISBN: 'ISBN',
  // game
  GAME_TITLE: '游戏名称',
  // drama
  DRAMA_TITLE: '舞台剧名称',
  // common
  RATING: '个人评分', // common
  RATING_DATE: '打分日期', // common
  COMMENTS: '我的短评', // common
  ITEM_LINK: '条目链接', // common
};

export const PropertyType = {
  POSTER: 'files',
  MOVIE_TITLE: 'title',
  MUSIC_TITLE: 'title',
  BOOK_TITLE: 'title',
  GAME_TITLE: 'title',
  DRAMA_TITLE: 'title',
  COVER: 'files',
  RATING: 'multi_select',
  RATING_DATE: 'date',
  COMMENTS: 'rich_text',
  YEAR: 'number',
  DIRECTORS: 'rich_text',
  ACTORS: 'rich_text',
  GENRE: 'multi_select',
  ITEM_LINK: 'url',
  IMDB_LINK: 'url',
  RELEASE_DATE: 'date',
  MUSICIAN: 'rich_text',
  PUBLICATION_DATE: 'date',
  PUBLISHING_HOUSE: 'rich_text',
  WRITER: 'rich_text',
  ISBN: 'number',
};

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
