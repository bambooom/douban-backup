const puppeteer = require('puppeteer');

(async function () {
  const browser = await puppeteer.launch({userDataDir: './udata', headless: false});
  const page = await browser.newPage();
  await page.goto('https://movie.douban.com/subject/1291842/');
})()
