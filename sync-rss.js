import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import dayjs from 'dayjs';
import got from 'got';
import { JSDOM } from 'jsdom';
import Parser from 'rss-parser';
import { DB_PROPERTIES, PropertyType, sleep } from './util.js';

dotenv.config();
const parser = new Parser();

const RATING_TEXT = {
  很差: 1,
  较差: 2,
  还行: 3,
  推荐: 4,
  力荐: 5,
};
const done = /^(看过|听过|读过|玩过)/;
const doing = /^(在看|在听|在读|在玩)/;
const wishlist = /^(想看|想听|想读|想玩)/;
const allStatus =
  /^(看过|听过|读过|玩过|在看|在听|在读|在玩|想看|想听|想读|想玩)/;
const CATEGORY = {
  movie: 'movie',
  music: 'music',
  book: 'book',
  game: 'game',
  drama: 'drama',
};
const EMOJI = {
  movie: '🎞',
  music: '🎶',
  book: '📖',
  game: '🕹',
  drama: '💃🏻',
};
// follow the schema value of Neodb
const STATUS = {
  Complete: 'complete',
  Progress: 'progress',
  Wishlist: 'wishlist',
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
const neodbToken = process.env.NEODB_API_TOKEN;

async function main() {
  console.log('Refreshing feeds from RSS...');
  let feeds;
  try {
    feeds = await parser.parseURL(
      `https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`
    );
  } catch (error) {
    console.error('Failed to parse RSS url: ', error);
    process.exit(1);
  }

  feeds = feeds.items;

  if (feeds.length === 0) {
    console.log('No new items.');
    return;
  }

  let groupByCategoryFeeds = {};
  const allFeeds = [];

  feeds.forEach((item) => {
    const { category, id, status } = extractItemInfo(item.title, item.link);
    const dom = new JSDOM(item.content.trim());
    const contents = [...dom.window.document.querySelectorAll('td p')];
    let rating = contents.filter((el) => el.textContent.startsWith('推荐'));
    if (rating.length) {
      rating = rating[0].textContent.replace(/^推荐: /, '').trim();
      rating = RATING_TEXT[rating];
    }
    let comment = contents.filter((el) => el.textContent.startsWith('备注'));
    if (comment.length) {
      comment = comment[0].textContent.replace(/^备注: /, '').trim();
    }
    const result = {
      id,
      link: item.link,
      rating: typeof rating === 'number' ? rating : null,
      comment: typeof comment === 'string' ? comment : null, // 备注：XXX -> 短评
      time: item.isoDate, // '2021-05-30T06:49:34.000Z'
      status,
      category,
    };
    if (status === STATUS.Complete) {
      if (!groupByCategoryFeeds[category]) {
        groupByCategoryFeeds[category] = [];
      }
      groupByCategoryFeeds[category].push(result);
    }
    allFeeds.push(result);
  });

  // 以下是和 notion 交互
  const categoryKeys = Object.keys(groupByCategoryFeeds);
  const AllFailedItems = [];
  if (categoryKeys.length) {
    for (const cateKey of categoryKeys) {
      try {
        const failedItems = await handleFeedNotion(groupByCategoryFeeds[cateKey], cateKey);
        AllFailedItems.push(...failedItems);
      } catch (error) {
        console.error(`Failed to handle ${cateKey} feeds. `, error);
        process.exit(1);
      }
    }
  }

  if (neodbToken) {
    // 同步标记到 neodb
    for (let i = 0; i < allFeeds.length; i++) {
      const item = allFeeds[i];
      await handleFeedNeodb(item);
    }
  }

  if (AllFailedItems.length) {
    console.log('Failed to handle the following feeds:');
    for (let i = 0; i < AllFailedItems.length; i++) {
      const item = AllFailedItems[i];
      console.log(`${item.title}: ${item.link}`);
    }
    process.exit(1);
  } else {
    console.log('All feeds are handled.');
  }
};

main();

async function handleFeedNeodb(item) {
  // fetch item by douban link
  const neodbItem = await got('https://neodb.social/api/catalog/fetch', {
    searchParams: {
      url: item.link,
    },
    headers: {
      accept: 'application/json',
    },
  }).json();
  // 条目不存在的话会被创建，但此时会返回 {message: 'Fetch in progress'}
  if (neodbItem.uuid) {
    try {
      const mark = await got(
        `https://neodb.social/api/me/shelf/item/${neodbItem.uuid}`,
        {
          headers: {
            Authorization: `Bearer ${neodbToken}`,
            accept: 'application/json',
          },
        }
      ).json();
      if (mark.shelf_type !== item.status) {
        // 标记状态不一样，所以更新标记
        await markItemNeodb(neodbItem, item);
      }
    } catch (error) {
      if (error.code === 'ERR_NON_2XX_3XX_RESPONSE') {
        // 标记不存在，所以创建标记
        await markItemNeodb(neodbItem, item);
      }
    }
  } else {
    await sleep(1000); // wait for the item to be created
    await handleFeedNeodb(item); // handle this feed again
  }
}

async function markItemNeodb(neodbItem, item) {
  console.log('Going to mark on NeoDB: ', neodbItem.title);
  try {
    await got.post(`https://neodb.social/api/me/shelf/item/${neodbItem.uuid}`, {
      headers: {
        Authorization: `Bearer ${neodbToken}`,
        accept: 'application/json',
      },
      json: {
        shelf_type: item.status,
        visibility: 2,
        comment_text: item.comment,
        rating_grade: item.rating ? item.rating * 2 : undefined,
        created_time: item.date,
        post_to_fediverse: false,
      },
    });
  } catch (error) {
    console.error(
      'Failed to mark item: ', neodbItem?.item?.title,
        ' with error: ',
      error
    );
  }
}

/**
 * Handles the feed for a given category.
 *
 * @param {Array} categorizedFeeds - The categorized feeds to handle.
 * @param {string} category - The category of the feeds.
 * @return {Array} - The list of failed items.
 */
async function handleFeedNotion(categorizedFeeds, category) {
  if (categorizedFeeds.length === 0) {
    console.log(`No new ${category} feeds.`);
    return;
  }

  const dbID = getDBID(category);
  if (!dbID) {
    console.log(`No notion database id for ${category}`);
    return;
  }

  console.log(`Handling ${category} feeds...`);

  const filtered = await notion.databases.query({
    database_id: dbID,
    filter: {
      or: categorizedFeeds.map((item) => ({
        property: DB_PROPERTIES.ITEM_LINK,
        url: {
          contains: item.id,
        },
      })),
    },
  }).catch((error) => {
    console.error(`Failed to query ${category} database to check already inserted items. `, error);
    process.exit(1);
  });

  const alreadyInsertedItems = new Set(filtered.results.map((i) => i.properties[DB_PROPERTIES.ITEM_LINK].url));

  const newFeeds = categorizedFeeds.filter((item) => {
    return !alreadyInsertedItems.has(item.link);
  });

  console.log(`There are total ${newFeeds.length} new ${category} item(s) need to insert.`);

  let failedItems = [];

  for (let i = 0; i < newFeeds.length; i++) {
    const item = newFeeds[i];
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
      const successful = await addToNotion(itemData, category);
      if (!successful) {
        failedItems.push(item);
      }
      await sleep(1000);
    }
  }

  if (failedItems.length) {
    console.log(`Failed to insert ${failedItems.length} items.`);
  }
  console.log(`${category} feeds done.`);
  console.log('====================');
  return failedItems;
}

/**
 * Extracts the category, ID, and status from the given title and link.
 *
 * @param {string} title - The title to extract the information from.
 * @param {string} link - The link to extract the information from.
 * @return {object} An object containing the extracted category, ID, and status.
 */
function extractItemInfo(title, link) {
  const m = title.match(allStatus)[1];
  let category, id, status;

  if (m === '看过' || m === '在看' || m === '想看') {
    if (link.startsWith('http://movie.douban.com/')) {
      category = CATEGORY.movie;
      id = link.match(/movie\.douban\.com\/subject\/(\d+)\/?/)[1];
    } else {
      category = CATEGORY.drama;
      id = link.match(/www\.douban\.com\/location\/drama\/(\d+)\/?/)[1];
    }
    status = m === '看过' ? STATUS.Complete : m === '在看' ? STATUS.Progress : STATUS.Wishlist;
  } else if (m === '读过' || m === '在读' || m === '想读') {
    category = CATEGORY.book;
    id = link.match(/book\.douban\.com\/subject\/(\d+)\/?/)[1];
    status = m === '读过' ? STATUS.Complete : m === '在读' ? STATUS.Progress : STATUS.Wishlist;
  } else if (m === '听过' || m === '在读' || m === '想听') {
    category = CATEGORY.music;
    id = link.match(/music\.douban\.com\/subject\/(\d+)\/?/)[1];
    status = m === '听过' ? STATUS.Complete : m === '在听' ? STATUS.Progress : STATUS.Wishlist;
  } else if (m === '玩过' || m === '在玩' || m === '想玩') {
    category = CATEGORY.game;
    id = link.match(/www\.douban\.com\/game\/(\d+)\/?/)[1];
    status = m === '玩过' ? STATUS.Complete : m === '在玩' ? STATUS.Progress : STATUS.Wishlist;
  } else {
    return { category: undefined, id: undefined, status: undefined };
  }

  return { category, id, status };
}

/**
 * Retrieves the database ID for the given category.
 *
 * @param {string} category - The category of the item.
 * @return {string} The corresponding database ID.
 */
function getDBID(category) {
  const databases = {
    [CATEGORY.movie]: movieDBID,
    [CATEGORY.music]: musicDBID,
    [CATEGORY.book]: bookDBID,
    [CATEGORY.game]: gameDBID,
    [CATEGORY.drama]: dramaDBID,
  };
  return databases[category];
}

/**
 * Fetches an item from douban webpage based on the given link and category.
 *
 * @param {string} link - The link to fetch the item from.
 * @param {string} category - The category of the item (movie, music, book, game, drama).
 * @return {Object} - An object containing the fetched item data.
 */
async function fetchItem(link, category) {
  console.log(`Fetching ${category} item with link: ${link}`);
  const itemData = {};
  const response = await got(link);
  const dom = new JSDOM(response.body);

  // movie item page
  if (category === CATEGORY.movie) {
    const title = dom.window.document
      .querySelector('#content h1 [property="v:itemreviewed"]')
      .textContent.trim();
    itemData[DB_PROPERTIES.NAME] = title;
    itemData[DB_PROPERTIES.MOVIE_TITLE] = title;
    itemData[DB_PROPERTIES.YEAR] = dom.window.document
      .querySelector('#content h1 .year')
      .textContent.slice(1, -1);
    const img = dom.window.document.querySelector('#mainpic img');
    if (img?.title === '点击看更多海报') {
      itemData[DB_PROPERTIES.POSTER] = img?.src
        .trim()
        .replace(/\.webp$/, '.jpg');
    }
    itemData[DB_PROPERTIES.DIRECTORS] =
      dom.window.document.querySelector('#info .attrs').textContent;
    itemData[DB_PROPERTIES.ACTORS] = [
      ...dom.window.document.querySelectorAll('#info .actor .attrs a'),
    ]
      .slice(0, 5)
      .map((i) => i.textContent)
      .join(' / ');
    itemData[DB_PROPERTIES.GENRE] = [
      ...dom.window.document.querySelectorAll('#info [property="v:genre"]'),
    ].map((i) => i.textContent); // array
    const imdbInfo = [
      ...dom.window.document.querySelectorAll('#info span.pl'),
    ].filter((i) => i.textContent.startsWith('IMDb'));
    if (imdbInfo.length) {
      itemData[DB_PROPERTIES.IMDB_LINK] =
        'https://www.imdb.com/title/' +
        imdbInfo[0].nextSibling.textContent.trim();
    }

    // music item page
  } else if (category === CATEGORY.music) {
    const title = dom.window.document
      .querySelector('#wrapper h1 span')
      .textContent.trim();
    itemData[DB_PROPERTIES.MUSIC_TITLE] = title;
    itemData[DB_PROPERTIES.NAME] = title;
    const img = dom.window.document.querySelector('#mainpic img');
    if (img?.title !== '点击上传封面图片' && img?.src.length <= 100) {
      itemData[DB_PROPERTIES.COVER] = img?.src.replace(/\.webp$/, '.jpg');
    }
    let info = [...dom.window.document.querySelectorAll('#info span.pl')];
    let release = info.filter((i) =>
      i.textContent.trim().startsWith('发行时间')
    );
    if (release.length) {
      let date = release[0].nextSibling.textContent.trim(); // 2021-05-31, or 2021-4-2
      itemData[DB_PROPERTIES.RELEASE_DATE] = dayjs(date).format('YYYY-MM-DD');
    }
    let musician = info.filter((i) =>
      i.textContent.trim().startsWith('表演者')
    );
    if (musician.length) {
      itemData[DB_PROPERTIES.MUSICIAN] = musician[0].textContent
        .replace('表演者:', '')
        .trim()
        .split('\n')
        .map((v) => v.trim())
        .join('');
      // split and trim to remove extra spaces, rich_text length limited to 2000
    }

    // book item page
  } else if (category === CATEGORY.book) {
    const title = dom.window.document
      .querySelector('#wrapper h1 [property="v:itemreviewed"]')
      .textContent.trim();
    itemData[DB_PROPERTIES.BOOK_TITLE] = title;
    itemData[DB_PROPERTIES.NAME] = title;
    const img = dom.window.document.querySelector('#mainpic img');
    if (img?.title !== '点击上传封面图片' && img?.src.length <= 100) {
      itemData[DB_PROPERTIES.COVER] = img?.src.replace(/\.webp$/, '.jpg');
    }
    let info = [...dom.window.document.querySelectorAll('#info span.pl')];
    info.forEach((i) => {
      let text = i.textContent.trim();
      let nextText = i.nextSibling?.textContent.trim();
      if (text.startsWith('作者')) {
        let parent = i.parentElement;
        if (parent.id === 'info') {
          // if only one writer, then parentElement is the #info container
          itemData[DB_PROPERTIES.WRITER] = i.nextElementSibling.textContent
            .replace(/\n/g, '')
            .replace(/\s/g, '');
        } else {
          // if multiple writers, there will be a separate <span> element
          itemData[DB_PROPERTIES.WRITER] = i.parentElement.textContent
            .trim()
            .replace('作者:', '')
            .trim();
        }
      } else if (text.startsWith('出版社')) {
        itemData[DB_PROPERTIES.PUBLISHING_HOUSE] = nextText;
      } else if (text.startsWith('原作名')) {
        itemData[DB_PROPERTIES.BOOK_TITLE] += nextText;
      } else if (text.startsWith('出版年')) {
        if (/年|月|日/.test(nextText)) {
          nextText = nextText.replace(/年|月|日/g, '-').slice(0, -1); // '2000年5月' special case
        }
        itemData[DB_PROPERTIES.PUBLICATION_DATE] =
          dayjs(nextText).format('YYYY-MM-DD'); // this can have only year, month, but need to format to YYYY-MM-DD
      } else if (text.startsWith('ISBN')) {
        itemData[DB_PROPERTIES.ISBN] = Number(nextText);
      }
    });

    // game item page
  } else if (category === CATEGORY.game) {
    const title = dom.window.document
      .querySelector('#wrapper #content h1')
      .textContent.trim();
    itemData[DB_PROPERTIES.GAME_TITLE] = title;
    itemData[DB_PROPERTIES.NAME] = title;
    const img = dom.window.document.querySelector('.item-subject-info .pic img');
    if (img?.title !== '点击上传封面图片' && img?.src.length <= 100) {
      itemData[DB_PROPERTIES.COVER] = img?.src.replace(/\.webp$/, '.jpg');
    }
    const gameInfo = dom.window.document.querySelector('#content .game-attr');
    const dts = [...gameInfo.querySelectorAll('dt')].filter(
      (i) =>
        i.textContent.startsWith('类型') || i.textContent.startsWith('发行日期')
    );
    if (dts.length) {
      dts.forEach((dt) => {
        if (dt.textContent.startsWith('类型')) {
          itemData[DB_PROPERTIES.GENRE] = [
            ...dt.nextElementSibling.querySelectorAll('a'),
          ].map((a) => a.textContent.trim()); //array
        } else if (dt.textContent.startsWith('发行日期')) {
          let date = dt.nextElementSibling.textContent.trim();
          itemData[DB_PROPERTIES.RELEASE_DATE] =
            dayjs(date).format('YYYY-MM-DD');
        }
      });
    }

    // drama item page
  } else if (category === CATEGORY.drama) {
    const title = dom.window.document
      .querySelector('#content .drama-info .meta h1')
      .textContent.trim();
    itemData[DB_PROPERTIES.DRAMA_TITLE] = title;
    itemData[DB_PROPERTIES.NAME] = title;
    let genre = dom.window.document
      .querySelector('#content .drama-info .meta [itemprop="genre"]')
      .textContent.trim();
    itemData[DB_PROPERTIES.GENRE] = [genre];
    const img = dom.window.document.querySelector('.drama-info .pic img');
    if (img?.title !== '点击上传封面图片' && img?.src.length <= 100) {
      itemData[DB_PROPERTIES.POSTER] = img?.src.replace(/\.webp$/, '.jpg');
    }
  }

  return itemData;
}

/**
 * Generates the value for a property based on the given parameters, ready to insert
 * into notion database.
 *
 * @param {any} value - The value to be used for generating the property value.
 * @param {string} type - The type of the property.
 * @param {string} key - The key associated with the property.
 * @return {object} The generated value for the property.
 */
function getPropertyValye(value, type, key) {
  let res = null;
  switch (type) {
    case 'title':
      res = {
        type: 'title',
        title: [
          {
            text: {
              content: value,
            },
          },
        ],
      };
      break;
    case 'files':
      res = {
        type: 'files',
        files: [
          {
            // file: {},
            name: value,
            type: 'external',
            external: {
              // need external:{} format to insert the files property, but still not successful
              url: value,
            },
          },
        ],
      };
      break;
    case 'date':
      res = {
        type: 'date',
        date: {
          start: value,
        },
      };
      break;
    case 'multi_select':
      res =
        key === DB_PROPERTIES.RATING
          ? {
              type: 'multi_select',
              multi_select: value
                ? [
                    {
                      name: value.toString(),
                    },
                  ]
                : [],
            }
          : {
              type: 'multi_select',
              multi_select: (value || []).map((g) => ({
                name: g, // @Q: if the option is not created before, can not use it directly here?
              })),
            };
      break;
    case 'rich_text':
      res = {
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: value || '',
            },
          },
        ],
      };
      break;
    case 'number':
      res = {
        type: 'number',
        number: value ? Number(value) : null,
      };
      break;
    case 'url':
      res = {
        type: 'url',
        url: value || url,
      };
      break;
    default:
      break;
  }

  return res;
}

/**
 * Inserts an item into Notion database.
 *
 * @param {Object} itemData - The data of the item to be inserted.
 * @param {string} category - The category of the item.
 * @return {boolean} - Returns true if the item is successfully inserted, false otherwise.
 */
async function addToNotion(itemData, category) {
  console.log(
    'Going to insert ',
    itemData[DB_PROPERTIES.RATING_DATE],
    itemData[DB_PROPERTIES.NAME]
  );
  let result = true;
  try {
    let properties = {};
    const keys = Object.keys(DB_PROPERTIES);
    keys.shift(); // remove fist one NAME
    keys.forEach((key) => {
      if (itemData[DB_PROPERTIES[key]]) {
        properties[DB_PROPERTIES[key]] = getPropertyValye(
          itemData[DB_PROPERTIES[key]],
          PropertyType[key],
          DB_PROPERTIES[key]
        );
      }
    });

    const dbid = getDBID(category);
    if (!dbid) {
      throw new Error('No databse id found for category: ' + category);
    }
    const db = await notion.databases.retrieve({ database_id: dbid });
    const columns = Object.keys(db.properties);
    // remove cols which are not in the current database
    const propKeys = Object.keys(properties);
    propKeys.map((prop) => {
      if (columns.indexOf(prop) < 0) {
        delete properties[prop];
      }
    });

    const postData = {
      parent: {
        database_id: dbid,
      },
      icon: {
        type: 'emoji',
        emoji: EMOJI[category],
      },
      // fill in properties by the format: https://developers.notion.com/reference/page#page-property-value
      properties,
    };
    if (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER]) {
      // use poster for the page cover
      postData.cover = {
        type: 'external',
        external: {
          url: (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER])?.files[0]?.external?.url, // cannot be empty string or null
        },
      };
    }
    const response = await notion.pages.create(postData);
    if (response && response.id) {
      console.log(
        itemData[DB_PROPERTIES.NAME] +
          `[${itemData[DB_PROPERTIES.ITEM_LINK]}]` +
          ' page created.'
      );
    }
  } catch (error) {
    console.warn(
      'Failed to create ' +
        itemData[DB_PROPERTIES.NAME] +
        `(${itemData[DB_PROPERTIES.ITEM_LINK]})` +
        ' with error: ',
      error
    );
    result = false;
  }

  return result;
}
