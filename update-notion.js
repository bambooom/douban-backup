/*
 * USAGE:
 * node update-notion.js db-movie-20210527.csv [skipMode=0/1]
 * skipMode = 0 means no need to skip already imported data by date
 *   -- update notion database from a csv
 *   -- can skip already inserted items
*/

import fs from 'node:fs';
import dotenv from 'dotenv';
import csv from 'fast-csv';
import { Client, LogLevel } from '@notionhq/client';
import dayjs from 'dayjs';
import got from 'got';
import { JSDOM } from 'jsdom';
import { DB_PROPERTIES, sleep } from './util.js';

dotenv.config();

// Initializing a client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  // logLevel: LogLevel.DEBUG,
});

// example: https://github.com/makenotion/notion-sdk-js/blob/main/examples/database-update-send-email/index.js

const databaseId = process.env.NOTION_MOVIE_DATABASE_ID;
// read csv file to csvData, and these are going to be filled in notion database
let csvData = [];

async function main() {
  // get input csv file from cli arg
  const [inputFile, skipMode = 1] = process.argv.slice(2);
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

  // console.log(lastMovieItem.results[0].properties[DB_PROPERTIES.GENRE]);

  // get the last inserted item's date
  const lastDate = lastMovieItem.results[0].properties[DB_PROPERTIES.RATING_DATE].date.start; // '2021-01-19'

  let skip = false;
  const rs = fs.createReadStream(inputFile);
  rs
    .pipe(csv.parse({ headers: true, discardUnmappedColumns: true, trim: true }))
    .on('error', error => console.error(error))
    .on('data', row => {
      if (Number(skipMode)) {
        if (skip) { return; }
        row[DB_PROPERTIES.RATING_DATE] = row[DB_PROPERTIES.RATING_DATE].replace(/\//g, '-');
        if (dayjs(row[DB_PROPERTIES.RATING_DATE]).isAfter(dayjs(lastDate))) {
          csvData.push(row); // only save the items after the lastDate
        } else {
          skip = true;
        }
      } else {
        row[DB_PROPERTIES.RATING_DATE] = row[DB_PROPERTIES.RATING_DATE].replace(/\//g, '-');
        csvData.push(row);
      }

    })
    .on('end', async rowCount => {
      console.log(`Parsed ${rowCount} rows, there are ${csvData.length} new items need to be handled.`);
      await handleNewItems();
    });
}

async function handleNewItems() {
  csvData = csvData.reverse();
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i]; // reverse the array
    const link = row[DB_PROPERTIES.ITEM_LINK];
    delete row['上映日期'];

    let itemData;
    try {
      itemData = await fetchItem(link); // https://movie.douban.com/subject/1291552/
      itemData = {...itemData, ...row}; // merge all data

    } catch (error) {
      console.error(row[DB_PROPERTIES.TITLE], error);
    }

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
  itemData[DB_PROPERTIES.ACTORS] = [...dom.window.document.querySelectorAll('#info .actor .attrs a')].slice(0, 5).map(i => i.textContent).join(' / ');
  itemData[DB_PROPERTIES.GENRE] = [...dom.window.document.querySelectorAll('#info [property="v:genre"]')].map(i => i.textContent); // array
  const imdbInfo = [...dom.window.document.querySelectorAll('#info span.pl')].filter(i => i.textContent.startsWith('IMDb'));
  if (imdbInfo.length) {
    itemData[DB_PROPERTIES.IMDB_LINK] = 'https://www.imdb.com/title/' + imdbInfo[0].nextSibling.textContent.trim();
  }
  return itemData;
}

async function addToNotion(itemData) {
  console.log('goint to insert ', itemData[DB_PROPERTIES.RATING_DATE], itemData[DB_PROPERTIES.TITLE]);
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

main();
