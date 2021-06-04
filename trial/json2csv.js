#!/usr/bin/env node

/*
 * node json2csv.js [input-file]
 */

const csv = require('fast-csv');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const [inputFile] = process.argv.slice(2);

if (!inputFile) {
  console.error('Input file is not provided');
  return;
}
const filename = inputFile.split('.').slice(0, -1).join('.');
const outputFile = 'notion-ready-' + filename + '.csv';

const adapter = new FileSync(inputFile);
const db = low(adapter);
const values = db.getState().values;

const headers = ['海报', '标题', '个人评分', '打分日期', '我的短评', '上映年份', '导演', '主演', '类型', '条目链接', 'IMDb 链接'];
const keys = ['img', 'title', 'rate', 'rate_date', 'comment', 'year', 'director', 'actors', 'genre', 'link', 'imdb'];
const rows = values.map(item => {
  return keys.map(k => {
    if (k === 'rate_date') {
      return item[k].replace(/-/g, '/');
    }
    return item[k];
  });
});

csv.writeToPath(outputFile, rows, {headers, quoteColumns: true})
    .on('error', err => console.error(err))
    .on('finish', () => console.log('Done writing.'));
