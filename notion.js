const fs = require('fs');
const csv = require('fast-csv');
require('dotenv').config();
const {Client, LogLevel} = require("@notionhq/client");
const dayjs = require('dayjs');
const got = require('got');
const jsdom = require("jsdom");
const {JSDOM} = jsdom;

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

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

// example: https://github.com/makenotion/notion-sdk-js/blob/main/examples/database-update-send-email/index.js

const databaseId = process.env.NOTION_DATABASE_ID;
// read csv file to csvData, and these are going to be filled in notion database
const csvData = [];

async function main() {
  // get input csv file from cli arg
  const [inputFile] = process.argv.slice(2);
  if (!inputFile) {
    console.error('Input csv file is not provided');
    return;
  }
  const splitted = inputFile.split('.');
  if (splitted.length > 1) {
    const ext = splitted.slice(-1)[0];
    if (ext !== 'csv') {
      console.error('Input file is not .csv format');
      return;
    }
  }

  // query current db last inserted item
  const lastMovieItem = await notion.databases.query({
    database_id: databaseId,
    sorts: [
      {
        property: DB_PROPERTIES.RATING_DATE,
        direction: 'descending',
      },
    ],
    page_size: 1,
  });

  // example of properties:
  // {
  //   '条目链接': {
  //     id: '=jBf',
  //       type: 'url',
  //         url: 'https://movie.douban.com/subject/26277363/'
  //   },
  //   'IMDb 链接': {
  //     id: '@ME}',
  //       type: 'url',
  //         url: 'https://www.imdb.com/title/tt5419278'
  //   },
  //   '主演': { id: 'X{lL', type: 'rich_text', rich_text: [[Object]] },
  //   '个人评分': { id: 'Z^ph', type: 'multi_select', multi_select: [[Object]] },
  //   '打分日期': {
  //     id: 'e\\{[',
  //       type: 'date',
  //         date: { start: '2021-01-19', end: null }
  //   },
  //   '类型': {
  //     id: 'pzY>',
  //       type: 'multi_select',
  //         multi_select: [[Object], [Object]]
  //   },
  //   '海报': { id: 't@Fv', type: 'files', files: [[Object]] },
  //   '我的短评': { id: 'wG?R', type: 'rich_text', rich_text: [[Object]] },
  //   '上映年份': { id: 'xghA', type: 'number', number: 2016 },
  //   '导演': { id: 'y]UL', type: 'rich_text', rich_text: [[Object]] },
  //   '标题': { id: 'title', type: 'title', title: [[Object]] }
  // }

  // get the last inserted item's date
  const lastDate = lastMovieItem.results[0].properties[DB_PROPERTIES.RATING_DATE].date.start; // '2021-01-19'

  let skip = false;
  const rs = fs.createReadStream(inputFile);
  rs
    .pipe(csv.parse({ headers: true, discardUnmappedColumns: true, trim: true }))
    .on('error', error => console.error(error))
    .on('data', row => {
      if (skip) { return; }
      row[RATING_DATE] = row[RATING_DATE].replace(/\//g, '-');
      if (dayjs(row[RATING_DATE]).isAfter(dayjs(lastDate))) {
        csvData.push(row); // only save the items after the lastDate
      } else {
        skip = true;
      }
    })
    .on('end', rowCount => {
      console.log(`Parsed ${rowCount} rows, there are ${csvData.length} new items need to be handled.`);
      await handleNewItems();
    });
}

async function handleNewItems() {
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    const link = row[DB_PROPERTIES.ITEM_LINK];
    delete row['上映日期'];
    row[DB_PROPERTIES.RATING_DATE] = row[DB_PROPERTIES.RATING_DATE].replace(/\//g, '-');

    let itemData;
    try {
      itemData = await fetchItem(link); // https://movie.douban.com/subject/1291552/
      itemData = {...itemData, ...row}; // merge all data

    } catch (error) {
      console.error(row[DB_PROPERTIES.TITLE], error);
    }
  // csv row example data:
  // {
  //   '标题': '无间双龙：这份爱，才是正义 / ウロボロス～この愛こそ、正義。',
  //   '个人评分': '5',
  //   '打分日期': '2015/03/21',
  //   '我的短评': '5星打的绝对不是剧情！为建国，为toma，为一众cast，就是如此任性ˊ_>ˋ(1 有用)',
  //   '上映日期': '2015/01/16',
  //   '制片国家': '日本',
  //   '条目链接': 'https://movie.douban.com/subject/25953663/'
  // }

    if (itemData) {
      await addToNotion(itemData);
      await sleep(3000); // wait for 3s to avoid blocking from douban
    }

  }
}

async function fetchItem(link) {
  const itemData = {};
  const response = await got(link);
  const dom = new JSDOM(response.body);
  itemData[DB_PROPERTIES.YEAR] = dom.window.document.querySelector('#content h1 .year').textContent.slice(1, -1);
  itemData[DB_PROPERTIES.POSTER] = dom.window.document.querySelector('#mainpic img').src.replace(/\.webp$/, '.jpg');
  itemData[DB_PROPERTIES.DIRECTORS] = dom.window.document.querySelector('#info .attrs').textContent;
  itemData[DB_PROPERTIES.ACTORS] = [...dom.window.document.querySelectorAll('#info .actor .attrs span')].slice(0, 5).map(i => i.textContent).join('');
  itemData[DB_PROPERTIES.GENRE] = [...dom.window.document.querySelectorAll('#info [property="v:genre"]')].map(i => i.textContent); // array
  const imdbInfo = [...dom.window.document.querySelectorAll('#info span.pl')].filter(i => i.textContent.startsWith('IMDb'));
  if (imdbInfo.length) {
    itemData[DB_PROPERTIES.IMDB_LINK] = 'https://www.imdb.com/title/' + imdbInfo[0].nextSibling.textContent.trim();
  }
  return itemData;
}

async function addToNotion(itemData) {
  const response = await notion.pages.create({
    parent: {
      database_id: databaseId,
    },
    properties: {
      // @todo: fill in properties by the format: https://developers.notion.com/reference/page#page-property-value

      Name: {
        title: [
          {
            text: {
              content: 'Tuscan Kale',
            },
          },
        ],
      },
      Description: {
        text: [
          {
            text: {
              content: 'A dark green leafy vegetable',
            },
          },
        ],
      },
      'Food group': {
        select: {
          name: '🥦 Vegetable',
        },
      },
      Price: {
        number: 2.5,
      },
    },
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          text: [
            {
              type: 'text',
              text: {
                content: 'Lacinato kale',
              },
            },
          ],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          text: [
            {
              type: 'text',
              text: {
                content: 'Lacinato kale is a variety of kale with a long tradition in Italian cuisine, especially that of Tuscany. It is also known as Tuscan kale, Italian kale, dinosaur kale, kale, flat back kale, palm tree kale, or black Tuscan palm.',
                link: {
                  url: 'https://en.wikipedia.org/wiki/Lacinato_kale',
                },
              },
            },
          ],
        },
      },
    ],
  });
}

// main();
