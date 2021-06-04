#!/usr/bin/env node

/*
 * node crawler.js [input-file]
 *  -- use puppeteer to craw the movie items data
 *  -- but **easy** to get blocked
 *  -- input is csv file
 *  -- use lowdb to write to a local json file
 *  -- then use json2csv.js to reverse back to a csv file
 *  -- which can be uploaded to notion database
 */

const fs = require('fs');
const puppeteer = require('puppeteer');
const csv = require('fast-csv');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

let db, csvData = [];

init();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function init() {
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
  const filename = splitted.slice(0, -1).join('.');
  const outputFile = 'db-' + filename + '.json';
  console.log('Output file is ' + outputFile);
  const adapter = new FileSync(outputFile);
  db = low(adapter);

  // check if db-*.json is initialized, set the defaults
  const hasValues = db.has('values').value();
  if (!hasValues) {
    db.defaults({count: 0, values: []})
      .write();
  }

  // read csv file to csvData
  fs.createReadStream(inputFile)
    .pipe(csv.parse({headers: true, discardUnmappedColumns: true, trim: true}))
    .on('error', error => console.error(error))
    .on('data', row => {
      csvData.push(row);
    })
    .on('end', async rowCount => {
      console.log(`Parsed ${rowCount} rows`);
      await fetchItems();
    });
}

async function fetchItems() {
  const browser = await puppeteer.launch({userDataDir: './udata', headless: true});
  const pagesPromises = [];
  let handleCount = 0, shouldHold = false;

  for (let i = 0; i < csvData.length; i = i + 10) {
    pagesPromises.length = 0; // empty the array without creating a new empty one
    for (let pi = 0; pi < 10; pi++) {
      if (i + pi < csvData.length) {
        const item = csvData[i + pi];
        const itemDd = db.get('values').find({link: item.link}).value(); // find the item in db
        if (!itemDd || !itemDd.checked) { // if not found item or item not checked
          handleCount++;
          if (handleCount % 70 === 0) {
            shouldHold = true;
          }
          pagesPromises.push(browser.newPage().then(page => extractItem(page, item)));
        }
      }
    }
    if (pagesPromises.length) {
      await Promise.all(pagesPromises);
      db.write(); // write/sync to file
      await sleep(Math.round(Math.random() * 30 + 1) * 100);
      if (shouldHold) {
        console.log(`Holding on for 60s...`);
        await sleep(6e4); // waiting 60s every 70 item handled
        shouldHold = false;
      }
    }
  }

  await browser.close();
}

async function extractItem(page, item) {
  await sleep(Math.round(Math.random() * 15) * 100); // set random sleep, < 1.5s
  await page.goto(item.link, {waitUntil: 'domcontentloaded'}).catch(err => {console.log('GOTO error with:', item.link, item.title, err)});
  const found = await page.$('#content h1 .year');
  if (found) { // means this item can be seen at least
    const year = await page.$eval('#content h1 .year', el => el.textContent.slice(1, -1)); // 电影上映年份
    item.year = year;

    try {
      const director = await page.$eval('#info .attrs', el => el.textContent); // 导演
      item.director = director;
    } catch (e) {
      console.log(item.title, 'cannot find director element');
    }

    try {
      const img = await page.$eval('#mainpic img', el => el.src); // 海报 uri
      item.img = img;
    } catch (e) {
      console.log(item.title, 'cannot find poster uri');
    }

    try {
      const actors = await page.$eval('#info .actor .attrs', el => [...el.querySelectorAll('span')].map(i => i.textContent).join('')); // 主演
      item.actors = actors;
    } catch (e) {
      console.log(item.title, 'cannot find actors alement');
    }

    try {
      const genre = await page.$$eval('#info [property="v:genre"]', els => [...els].map(i => i.textContent).join(' / ')); // 类型
      item.genre = genre;
    } catch (e) {
      console.log(item.title, 'cannot find genre elements');
    }

    try {
      const imdb = await page.$$eval('#info .pl', els => {
        const filtered = [...els].filter(e => e.textContent.startsWith('IMDb')); // 找 IMDb 链接
        if (filtered.length) {
          return filtered[0].nextElementSibling.href;
        }
        return '';
      });
      item.imdb = imdb;
    } catch (error) {
      console.log(item.title, 'cannot find imdb link');
    }

    item.checked = 1;
    console.log(item.title, item.link, 'checked~!');
    db.get('values')
      .push(item)
      .value();
    db.update('count', n => n + 1)
      .value();

  } else {
    try {
      const text = await page.$eval('.article h2', el => el.textContent);
      if (text.startsWith('…你访问豆瓣的方式有点像机器人程序。')) {
        console.error('NOT HUMAN.');
        process.exit(1);
      }
    } catch (e) {
      // do noting
    }
    console.log('FAILED to extract info from: ', item.title, item.link);
    const itemDd = db.get('values').find({link: item.link}).value();
    if (!itemDd) {
      console.log('Still going to write into db for: ', item.title, item.link)
      item.checked = 1;
      db.get('values')
        .push(item)
        .value();
      db.update('count', n => n + 1)
        .value();
    }
  }
  await sleep(Math.round(Math.random() * 20) * 100);
  await page.close();
}
