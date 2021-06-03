const DB_PROPERTIES = {
  // movie
  POSTER: '海报',
  TITLE: '标题', // common
  RATING: '个人评分', // common
  RATING_DATE: '打分日期', // common
  COMMENTS: '我的短评', // common
  YEAR: '上映年份',
  DIRECTORS: '导演',
  ACTORS: '主演',
  GENRE: '类型',
  ITEM_LINK: '条目链接', // common
  IMDB_LINK: 'IMDb 链接',
  // music
  RELEASE_DATE: '发行日期',
  MUSICIAN: '音乐家',
  // book
  PUBLICATION_DATE: '出版日期',
  PUBLISHING_HOUSE: '出版社',
  WRITER: '作者',
  ISBN: 'ISBN',
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  DB_PROPERTIES,
  sleep,
};
