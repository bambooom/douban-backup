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

const DOUBAN_USER_ID = process.env.DOUBAN_USER_ID;
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});
const databaseId = process.env.NOTION_DATABASE_ID;

(async () => {
  console.log('Refreshing feeds from RSS...');
  let feed = await parser.parseURL(`https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`);

  feed = feed.items.filter(item => /^看过/.test(item.title)) // care for done status items only for now
    .map(item => {
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
      return {
        link: item.link,
        rating: typeof rating === 'number' ? rating : null,
        comment: typeof comment === 'string' ? comment: null, // 备注：XXX -> 短评
        time: item.isoDate, // '2021-05-30T06:49:34.000Z'
      };
    });

  if (feed.length === 0) {
    console.log('No new items.');
    return;
  }

  // query current db for feeds
  const filteredItems = await notion.databases.query({
    database_id: databaseId,
    filter: {
      or: feed.map(item => ({
        property: DB_PROPERTIES.ITEM_LINK,
        url: {
          equals: item.link,
        },
      })),
    },
  });

  if (filteredItems.results.length) { // some items in feed has already inserted
    feed = feed.filter(item => {
      let findItem = filteredItems.results.filter(i => i.properties[DB_PROPERTIES.ITEM_LINK].url === item.link);
      return !findItem.length; // if length != 0 means can find item in the filtered results, means this item already in db
    });
  }

  console.log(`There are total ${feed.length} new item(s) need to insert.`);

  for (let i = 0; i < feed.length; i++) {
    const item = feed[i];
    const link = item.link;
    let itemData;
    try {
      itemData = await fetchItem(link);
      itemData[DB_PROPERTIES.ITEM_LINK] = link;
      itemData[DB_PROPERTIES.RATING] = item.rating;
      itemData[DB_PROPERTIES.RATING_DATE] = dayjs(item.isoDate).format('YYYY-MM-DD');
      itemData[DB_PROPERTIES.COMMENTS] = item.comment;
    } catch (error) {
      console.error(link, error);
    }

    if (itemData) {
      await addToNotion(itemData);
      await sleep(1000);
    }

  }
})();

async function fetchItem(link) {
  console.log('Fetching item with link: ', link);
  const itemData = {};
  const response = await got(link);
  const dom = new JSDOM(response.body);
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
  return itemData;
}

async function addToNotion(itemData) {
  console.log('Goint to insert ', itemData[DB_PROPERTIES.RATING_DATE], itemData[DB_PROPERTIES.TITLE]);
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties: {
        // fill in properties by the format: https://developers.notion.com/reference/page#page-property-value
        [DB_PROPERTIES.POSTER]: {
          files: [
            {
              name: itemData[DB_PROPERTIES.POSTER],
            }
          ],
        },
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
        [DB_PROPERTIES.ITEM_LINK]: {
          url: itemData[DB_PROPERTIES.ITEM_LINK],
        },
        [DB_PROPERTIES.IMDB_LINK]: {
          url: itemData[DB_PROPERTIES.IMDB_LINK] || null,
        },
      },
    });
    if (response && response.id) {
      console.log(itemData[DB_PROPERTIES.TITLE] + `(${itemData[DB_PROPERTIES.ITEM_LINK]})` + ' page created.');
    }
  } catch (error) {
    console.warn('Failed to create ' + itemData[DB_PROPERTIES.TITLE] + `(${itemData[DB_PROPERTIES.ITEM_LINK]})` + ' with error: ', error);
  }
}
