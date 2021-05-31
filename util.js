const DB_PROPERTIES = {
  POSTER: '海报',
  TITLE: '标题',
  RATING: '个人评分',
  RATING_DATE: '打分日期',
  COMMENTS: '我的短评',
  YEAR: '上映年份',
  DIRECTORS: '导演',
  ACTORS: '主演',
  GENRE: '类型',
  ITEM_LINK: '条目链接',
  IMDB_LINK: 'IMDb 链接',
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  DB_PROPERTIES,
  sleep,
};
