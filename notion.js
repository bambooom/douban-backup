const fs = require('fs');
const csv = require('fast-csv');
require('dotenv').config();
const {Client, LogLevel} = require("@notionhq/client");
const dayjs = require('dayjs');

const RATING_DATE = '打分日期';

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  logLevel: LogLevel.DEBUG,
});

// example: https://github.com/makenotion/notion-sdk-js/blob/main/examples/database-update-send-email/index.js

const databaseId = process.env.NOTION_DATABASE_ID;

(async () => {
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
        property: RATING_DATE,
        direction: 'descending',
      },
    ],
    page_size: 1,
  });

  // get the last inserted item's date
  const lastDate = lastMovieItem.results[0].properties[RATING_DATE].date.start; // '2021-01-19'

  // read csv file to csvData
  const csvData = [];
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
        // @todo: request to add row to notion db
// {
//   '标题': '无间双龙：这份爱，才是正义 / ウロボロス～この愛こそ、正義。',
//   '个人评分': '5',
//   '打分日期': '2015/03/21',
//   '我的短评': '5星打的绝对不是剧情！为建国，为toma，为一众cast，就是如此任性ˊ_>ˋ(1 有用)',
//   '上映日期': '2015/01/16',
//   '制片国家': '日本',
//   '条目链接': 'https://movie.douban.com/subject/25953663/'
// }
      } else {
        skip = true;
      }
    })
    .on('end', rowCount => {
      console.log(`Parsed ${rowCount} rows`);
      console.log(csvData.length);
    });

})()
