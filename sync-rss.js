const {config} = require('dotenv');
const {Client} = require("@notionhq/client");
const dayjs = require('dayjs');
const got = require('got');
const jsdom = require("jsdom");
const {JSDOM} = jsdom;
const Parser = require('rss-parser');
const parser = new Parser();
const {DB_PROPERTIES, sleep} = require('./util');

config();

const RATING_TEXT = {
  '很差': 1,
  '较差': 2,
  '还行': 3,
  '推荐': 4,
  '力荐': 5,
};
const done = /^(看过|听过|读过|玩过)/;
const CATEGORY = {
  movie: 'movie',
  music: 'music',
  book: 'book',
  game: 'game',
  drama: 'drama',
};

const DOUBAN_USER_ID = process.env.DOUBAN_USER_ID;
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});
const movieDBID = process.env.NOTION_MOVIE_DATABASE_ID;
const musicDBID = process.env.NOTION_MUSIC_DATABASE_ID;
const bookDBID = process.env.NOTION_BOOK_DATABASE_ID;
const gameDBID = process.env.NOTION_GAME_DATABASE_ID;
const dramaDBID = process.env.NOTION_DRAMA_DATABASE_ID;

(async () => {
  console.log('Refreshing feeds from RSS...');
  let feed;
  try {
    feed = await parser.parseURL(`https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`);
  } catch (error) {
    console.error('Failed to parse RSS url: ', error);
    process.exit(1);
  }

  let feedData = {};

  feed = feed.items.filter(item => done.test(item.title)); // care for done status items only for now
  feed.forEach(item => {
    const {category, id} = getCategoryAndId(item.title, item.link);
    const dom = new JSDOM(item.content.trim());
    const contents = [...dom.window.document.querySelectorAll('td p')];
    let rating = contents.filter(el => el.textContent.startsWith('推荐'));
    if (rating.length) {
      rating = rating[0].textContent.replace(/^推荐: /, '').trim();
      rating = RATING_TEXT[rating];
    }
    let comment = contents.filter(el => el.textContent.startsWith('备注'));
    if (comment.length) {
      comment = comment[0].textContent.replace(/^备注: /, '').trim();
    }
    const result = {
      id,
      link: item.link,
      rating: typeof rating === 'number' ? rating : null,
      comment: typeof comment === 'string' ? comment : null, // 备注：XXX -> 短评
      time: item.isoDate, // '2021-05-30T06:49:34.000Z'
    };
    if (!feedData[category]) {
      feedData[category] = [];
    }
    feedData[category].push(result);
  });

  if (feed.length === 0) {
    console.log('No new items.');
    return;
  }

  const categoryKeys = Object.keys(feedData);
  if (categoryKeys.length) {
    for (const cateKey of categoryKeys) {
      try {
        await handleFeed(feedData[cateKey], cateKey);
      } catch (error) {
        console.error(`Failed to handle ${cateKey} feed. `, error);
        process.exit(1);
      }
    }
  }

  console.log('All feeds are handled.');
})();

async function handleFeed(feed, category) {
  if (feed.length === 0) {
    console.log(`No new ${category} feeds.`);
    return;
  }

  console.log(`Handling ${category} feeds...`);
  // query current db to check whether already inserted
  let filtered;
  try {
    filtered = await notion.databases.query({
      database_id: getDBID(category),
      filter: {
        or: feed.map(item => ({
          property: DB_PROPERTIES.ITEM_LINK,
          url: {
            contains: item.id,
            // use id to check whether an item is already inserted, better than url
            // as url may be http/https, ending with or withour /
          },
        })),
      },
    });
  } catch (error) {
    console.error(`Failed to query ${category} database to check already inserted items. `, error);
    process.exit(1);
  }

  if (filtered.results.length) {
    feed = feed.filter(item => {
      let findItem = filtered.results.filter(i => i.properties[DB_PROPERTIES.ITEM_LINK].url === item.link);
      return !findItem.length; // if length != 0 means can find item in the filtered results, means this item already in db
    });
  }

  console.log(`There are total ${feed.length} new ${category} item(s) need to insert.`);

  for (let i = 0; i < feed.length; i++) {
    const item = feed[i];
    const link = item.link;
    let itemData;
    try {
      itemData = await fetchItem(link, category);
      itemData[DB_PROPERTIES.ITEM_LINK] = link;
      itemData[DB_PROPERTIES.RATING] = item.rating;
      itemData[DB_PROPERTIES.RATING_DATE] = dayjs(item.time).format('YYYY-MM-DD');
      itemData[DB_PROPERTIES.COMMENTS] = item.comment;
    } catch (error) {
      console.error(link, error);
    }

    if (itemData) {
      await addToNotion(itemData, category);
      await sleep(1000);
    }
  }
  console.log(`${category} feeds done.`);
  console.log('====================');
}

function getCategoryAndId(title, link) {
  let m = title.match(done);
  m = m[1];
  let res, id;
  switch (m) {
    case '看过':
      if (link.startsWith('http://movie.douban.com/')) {
        res = CATEGORY.movie; // "看过" maybe 舞台剧
        id = link.match(/movie\.douban\.com\/subject\/(\d+)\/?/);
        id = id[1]; // string
      } else {
        res = CATEGORY.drama; // 舞台剧
        id = link.match(/www\.douban\.com\/location\/drama\/(\d+)\/?/);
        id = id[1]; // string
      }
      break;
    case '读过':
      res = CATEGORY.book;
      id = link.match(/book\.douban\.com\/subject\/(\d+)\/?/);
      id = id[1]; // string
      break;
    case '听过':
      res = CATEGORY.music;
      id = link.match(/music\.douban\.com\/subject\/(\d+)\/?/);
      id = id[1]; // string
      break;
    case '玩过':
      res = CATEGORY.game;
      id = link.match(/www\.douban\.com\/game\/(\d+)\/?/);
      id = id[1]; // string
      break;
    default:
      break;
  }
  return {category: res, id};
}

function getDBID(category) {
  let id;
  switch (category) {
    case CATEGORY.movie:
      id = movieDBID;
      break;
    case CATEGORY.music:
      id = musicDBID;
      break;
    case CATEGORY.book:
      id = bookDBID;
      break;
    case CATEGORY.game:
      id = gameDBID;
      break;
    case CATEGORY.drama:
      id = dramaDBID;
      break;
    default:
      break;
  }
  return id;
}

async function fetchItem(link, category) {
  console.log(`Fetching ${category} item with link: ${link}`);
  const itemData = {};
  const response = await got(link);
  const dom = new JSDOM(response.body);

  // movie item page
  if (category === CATEGORY.movie) {
    itemData[DB_PROPERTIES.TITLE] = dom.window.document.querySelector('#content h1 [property="v:itemreviewed"]').textContent.trim();
    itemData[DB_PROPERTIES.YEAR] = dom.window.document.querySelector('#content h1 .year').textContent.slice(1, -1);
    itemData[DB_PROPERTIES.POSTER] = dom.window.document.querySelector('#mainpic img').src.replace(/\.webp$/, '.jpg');
    itemData[DB_PROPERTIES.DIRECTORS] = dom.window.document.querySelector('#info .attrs').textContent;
    itemData[DB_PROPERTIES.ACTORS] = [...dom.window.document.querySelectorAll('#info .actor .attrs a')].slice(0, 5).map(i => i.textContent).join(' / ');
    itemData[DB_PROPERTIES.GENRE] = [...dom.window.document.querySelectorAll('#info [property="v:genre"]')].map(i => i.textContent); // array
    const imdbInfo = [...dom.window.document.querySelectorAll('#info span.pl')].filter(i => i.textContent.startsWith('IMDb'));
    if (imdbInfo.length) {
      itemData[DB_PROPERTIES.IMDB_LINK] = 'https://www.imdb.com/title/' + imdbInfo[0].nextSibling.textContent.trim();
    }

  // music item page
  } else if (category === CATEGORY.music) {
    itemData[DB_PROPERTIES.TITLE] = dom.window.document.querySelector('#wrapper h1 span').textContent.trim();
    let info = [...dom.window.document.querySelectorAll('#info span.pl')];
    let release = info.filter(i => i.textContent.trim().startsWith('发行时间'));
    if (release.length) {
      let date = release[0].nextSibling.textContent.trim(); // 2021-05-31, or 2021-4-2
      itemData[DB_PROPERTIES.RELEASE_DATE] = dayjs(date).format('YYYY-MM-DD');
    }
    let musician = info.filter(i => i.textContent.trim().startsWith('表演者'));
    if (musician.length) {
      itemData[DB_PROPERTIES.MUSICIAN] = musician[0].textContent.replace('表演者:', '').trim();
    }

  // book item page
  } else if (category === CATEGORY.book) {
    itemData[DB_PROPERTIES.TITLE] = dom.window.document.querySelector('#wrapper h1 [property="v:itemreviewed"]').textContent.trim();
    let info = [...dom.window.document.querySelectorAll('#info span.pl')];
    info.forEach(i => {
      let text = i.textContent.trim();
      let nextText = i.nextSibling?.textContent.trim();
      if (text.startsWith('作者')) {
        let parent = i.parentElement;
        if (parent.id === 'info') { // if only one writer, then parentElement is the #info container
          itemData[DB_PROPERTIES.WRITER] = i.nextElementSibling.textContent.replace(/\n/g, '').replace(/\s/g, '');
        } else { // if multiple writers, there will be a separate <span> element
          itemData[DB_PROPERTIES.WRITER] = i.parentElement.textContent.trim().replace('作者:', '').trim();
        }
      } else if (text.startsWith('出版社')) {
        itemData[DB_PROPERTIES.PUBLISHING_HOUSE] = nextText;
      } else if (text.startsWith('原作名')) {
        itemData[DB_PROPERTIES.TITLE] += nextText;
      } else if (text.startsWith('出版年')) {
        itemData[DB_PROPERTIES.PUBLICATION_DATE] = dayjs(nextText).format('YYYY-MM-DD'); // this can have only year, month, but need to format to YYYY-MM-DD
      } else if (text.startsWith('ISBN')) {
        itemData[DB_PROPERTIES.ISBN] = Number(nextText);
      }
    });

  // game item page
  } else if (category === CATEGORY.game) {
    itemData[DB_PROPERTIES.TITLE] = dom.window.document.querySelector('#wrapper #content h1').textContent.trim();
    itemData[DB_PROPERTIES.POSTER] = dom.window.document.querySelector('.item-subject-info .pic img').src.replace(/\.webp$/, '.jpg');
    const gameInfo = dom.window.document.querySelector('#content .game-attr');
    const dts = [...gameInfo.querySelectorAll('dt')].filter(i => i.textContent.startsWith('类型') || i.textContent.startsWith('发行日期'));
    if (dts.length) {
      dts.forEach(dt => {
        if (dt.textContent.startsWith('类型')) {
          itemData[DB_PROPERTIES.GENRE] = [...dt.nextElementSibling.querySelectorAll('a')].map(a => a.textContent.trim()); //array
        } else if (dt.textContent.startsWith('发行日期')) {
          let date = dt.nextElementSibling.textContent.trim();
          itemData[DB_PROPERTIES.RELEASE_DATE] = dayjs(date).format('YYYY-MM-DD');
        }
      })
    }

  // drama item page
  } else if (category === CATEGORY.drama) {
    itemData[DB_PROPERTIES.TITLE] = dom.window.document.querySelector('#content .drama-info .meta h1').textContent.trim();
    let genre = dom.window.document.querySelector('#content .drama-info .meta [itemprop="genre"]').textContent.trim();
    itemData[DB_PROPERTIES.GENRE] = [genre];
    itemData[DB_PROPERTIES.POSTER] = dom.window.document.querySelector('.drama-info .pic img').src.replace(/\.webp$/, '.jpg');
  }

  return itemData;
}

async function addToNotion(itemData, category) {
  console.log('Going to insert ', itemData[DB_PROPERTIES.RATING_DATE], itemData[DB_PROPERTIES.TITLE]);
  try {
    // @TODO: refactor this to add property value generator by value type
    let properties = {
      [DB_PROPERTIES.TITLE]: {
        title: [
          {
            text: {
              content: itemData[DB_PROPERTIES.TITLE],
            },
          },
        ]
      },
      [DB_PROPERTIES.RATING]: {
        'multi_select': itemData[DB_PROPERTIES.RATING] ? [
          {
            name: itemData[DB_PROPERTIES.RATING].toString(),
          },
        ] : [], // if no rating, then this multi_select should be an empty array
      },
      [DB_PROPERTIES.RATING_DATE]: {
        date: {
          start: itemData[DB_PROPERTIES.RATING_DATE],
        },
      },
      [DB_PROPERTIES.COMMENTS]: {
        'rich_text': [
          {
            type: 'text',
            text: {
              content: itemData[DB_PROPERTIES.COMMENTS] || '',
            },
          },
        ],
      },
      [DB_PROPERTIES.ITEM_LINK]: {
        url: itemData[DB_PROPERTIES.ITEM_LINK],
      },
    };

    if (category === CATEGORY.movie) {
      properties = {
        ...properties,
        [DB_PROPERTIES.POSTER]: {
          files: [
            {
              // file: {}
              name: itemData[DB_PROPERTIES.POSTER],
              external: { // need external:{} format to insert the files property, but still not successful
                url: itemData[DB_PROPERTIES.POSTER],
              },
            },
          ],
        },
        [DB_PROPERTIES.YEAR]: {
          number: Number(itemData[DB_PROPERTIES.YEAR]),
        },
        [DB_PROPERTIES.DIRECTORS]: {
          'rich_text': [
            {
              type: 'text',
              text: {
                content: itemData[DB_PROPERTIES.DIRECTORS],
              },
            },
          ],
        },
        [DB_PROPERTIES.ACTORS]: {
          'rich_text': [
            {
              type: 'text',
              text: {
                content: itemData[DB_PROPERTIES.ACTORS],
              },
            },
          ],
        },
        [DB_PROPERTIES.GENRE]: { // array
          'multi_select': (itemData[DB_PROPERTIES.GENRE] || []).map(g => ({
            name: g, // @Q: if the option is not created before, can not use it directly here?
          })),
        },
        [DB_PROPERTIES.IMDB_LINK]: {
          url: itemData[DB_PROPERTIES.IMDB_LINK] || null,
        },
      };

    } else if (category === CATEGORY.music) {
      properties = {
        ...properties,
        [DB_PROPERTIES.RELEASE_DATE]: {
          date: {
            start: itemData[DB_PROPERTIES.RELEASE_DATE],
          },
        },
        [DB_PROPERTIES.MUSICIAN]: {
          'rich_text': [
            {
              type: 'text',
              text: {
                content: itemData[DB_PROPERTIES.MUSICIAN],
              },
            },
          ],
        },
      };

    } else if (category === CATEGORY.book) {
      properties = {
        ...properties,
        [DB_PROPERTIES.PUBLICATION_DATE]: {
          date: {
            start: itemData[DB_PROPERTIES.PUBLICATION_DATE],
          },
        },
        [DB_PROPERTIES.PUBLISHING_HOUSE]: {
          'rich_text': [
            {
              type: 'text',
              text: {
                content: itemData[DB_PROPERTIES.PUBLISHING_HOUSE] || '',
              },
            },
          ],
        },
        [DB_PROPERTIES.WRITER]: {
          'rich_text': [
            {
              type: 'text',
              text: {
                content: itemData[DB_PROPERTIES.WRITER] || '',
              },
            },
          ],
        },
        [DB_PROPERTIES.ISBN]: {
          number: itemData[DB_PROPERTIES.ISBN] || null,
        },
      };
    } else if (category === CATEGORY.game) {
      properties = {
        ...properties,
        [DB_PROPERTIES.RELEASE_DATE]: {
          date: {
            start: itemData[DB_PROPERTIES.RELEASE_DATE],
          },
        },
        [DB_PROPERTIES.GENRE]: { // array
          'multi_select': (itemData[DB_PROPERTIES.GENRE] || []).map(g => ({
            name: g,
          })),
        },
        [DB_PROPERTIES.POSTER]: {
          files: [
            {
              // file: {}
              name: itemData[DB_PROPERTIES.POSTER],
              external: { // need external:{} format to insert the files property, but still not successful
                url: itemData[DB_PROPERTIES.POSTER],
              },
            },
          ],
        },
      };
    } else if (category === CATEGORY.drama) {
      properties = {
        ...properties,
        [DB_PROPERTIES.GENRE]: { // array
          'multi_select': (itemData[DB_PROPERTIES.GENRE] || []).map(g => ({
            name: g,
          })),
        },
        [DB_PROPERTIES.POSTER]: {
          files: [
            {
              // file: {}
              name: itemData[DB_PROPERTIES.POSTER],
              external: { // need external:{} format to insert the files property, but still not successful
                url: itemData[DB_PROPERTIES.POSTER],
              },
            },
          ],
        },
      };
    }

    const dbid = getDBID(category);
    const db = await notion.databases.retrieve({database_id: dbid});
    const columns = Object.keys(db.properties);
    // remove cols which are not in the current database
    const propKeys = Object.keys(properties);
    propKeys.map(prop => {
      if (columns.indexOf(prop) < 0) {
        delete properties[prop];
      }
    });

    const response = await notion.pages.create({
      parent: {
        database_id: dbid,
      },
      // fill in properties by the format: https://developers.notion.com/reference/page#page-property-value
      properties,
    });
    if (response && response.id) {
      console.log(itemData[DB_PROPERTIES.TITLE] + `[${itemData[DB_PROPERTIES.ITEM_LINK]}]` + ' page created.');
    }
  } catch (error) {
    console.warn('Failed to create ' + itemData[DB_PROPERTIES.TITLE] + `(${itemData[DB_PROPERTIES.ITEM_LINK]})` + ' with error: ', error);
  }
}
