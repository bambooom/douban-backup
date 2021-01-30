const puppeteer = require('puppeteer');

(async function () {
  const browser = await puppeteer.launch({userDataDir: './udata', headless: false});
  const page = await browser.newPage();
  await page.goto('https://movie.douban.com/subject/1291843/');
  browser.on('disconnected', () => {
    setTimeout(() => {
      process.exit(0);
    }, 1500);
  });
  browser.on('targetdestroyed', async() => {
    await browser.close();
  });

})()
