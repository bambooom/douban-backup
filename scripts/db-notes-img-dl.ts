/*
 * Use to download images from exported 豆瓣日记 md files
*/

import fs from "node:fs";
import path from "node:path";
import { promisify } from 'node:util';
import download from 'image-downloader';
import { sleep } from '../src/utils';
// const pinyin = require("pinyin"); // no need to convert Chinese titles now

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const readDir = promisify(fs.readdir);
const mkDir = promisify(fs.mkdir);

const DIR = './douban-notes-20210716';
// const DIR = './douban-notes-test'; // for test
const IMG_DIR = './assets/images';
const IMG_PREFIX = '/assets/images/'; // for my blog setting

(async () => {
  const notesFiles = await readDir(DIR);
  let COUNT = 0, FAILED_URLS: string[] = [];
  for (const notesFile of notesFiles) {
    let basename = path.basename(notesFile); // 2020-07-08-filename.md
    basename = basename.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/)?.[1].replace(/\s/g, '-')!; // filename, no .md, use as image folder name

    let file = await readFile(path.resolve(__dirname, `${DIR}/${notesFile}`), 'utf8');
    let imgs: string[] = [];
    file = file.replace(/!\[(.*?)\]\((.+?)\)/g, function (whole, desc, url) {
      imgs.push(url);
      let name = url.match(/\/([^/]*\.(?:jpg|webp))$/); // last p12344.jpg
      return `![${desc}](${IMG_PREFIX}${basename}/${name[1]})`; // last is pic name
    });
    if (imgs.length > 0) {
      console.log(basename, ' has ', imgs.length, ' images.');
      const imgDir = path.resolve(__dirname, path.join(IMG_DIR, basename));
      await mkDir(imgDir, {recursive: true}); // mkdir for images

      for (const url of imgs) {
        await download.image({
          url,
          dest: imgDir,
        })
          .then(({filename}) => {
            console.log('Saved to', filename);
            COUNT++;
          })
          .catch(() => {
            let msg = 'Failed to download ' + url + ' which belongs to ' + basename;
            FAILED_URLS.push(msg);
          });

        if (COUNT % 100 === 0) {
          console.log(`Already ${COUNT} images, wait for 3 seconds...`);
          await sleep(3000);
        }
      }
      await writeFile(path.resolve(__dirname, `${DIR}/${notesFile}`), file, 'utf8'); // write to the file
    }
  }
  console.log(FAILED_URLS);
})();
