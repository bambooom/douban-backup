import got from 'got';
import crypto from 'crypto';
import { CookieJar } from 'tough-cookie';
import { JSDOM } from 'jsdom';
import dayjs from 'dayjs';
import { consola } from 'consola';
import { ItemCategory } from './types';
import DB_PROPERTIES from '../cols.json';
import { sleep } from './utils';

// 创建一个持久化的 CookieJar 实例，建议放在函数外部以维持会话
const cookieJar = new CookieJar();

// 辅助函数：解 PoW 难题
async function solveDoubanPoW(html: string) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const tok = (doc.querySelector('#tok') as HTMLInputElement)?.value;
  const cha = (doc.querySelector('#cha') as HTMLInputElement)?.value;
  const red = (doc.querySelector('#red') as HTMLInputElement)?.value;

  if (!tok || !cha) return null;

  let nonce = 0;
  const difficulty = 4;
  const target = '0'.repeat(difficulty);

  // 开始挖矿
  while (true) {
    nonce++;
    const hash = crypto.createHash('sha512').update(cha + nonce).digest('hex');
    if (hash.startsWith(target)) break;
  }

  return { tok, cha, sol: nonce, red };
}

export default async function scrapyDouban(link: string, category: ItemCategory): Promise<{
    [key: string]: string | string[] | number | null | undefined;
}> {
  consola.start(`Scraping ${category} item with link: ${link}`);

  // 3. 配置通用的 got 客户端, fake user-agent
  const client = got.extend({
    cookieJar,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': link,
    },
    followRedirect: true
  });

  let response = await client(link);

  // 4. 检查是否命中了 PoW 挑战页
  if (response.body.includes('id="sec"') && response.body.includes('sha512')) {
    consola.info('Detected Douban PoW challenge, solving...');
    const payload = await solveDoubanPoW(response.body);

    if (payload) {
      // 添加随机延迟更保险 600ms~1200ms
      const delay = Math.floor(Math.random() * 600) + 600;
      await sleep(delay);
      // 提交验证表单
      await client.post('https://sec.douban.com/c', {
        form: payload
      });
      consola.success('PoW solved and submitted. Retrying original request...');

      // 验证通过后，带上新 Cookie 重新请求
      response = await client(link);
    }
  }

  const dom = new JSDOM(response.body);
  const doc = dom.window.document;

  // 检查是否依然在验证页（可能 IP 被彻底封禁或验证失败）
  if (doc.querySelector('#sec')) {
    throw new Error('Failed to bypass Douban security page. Might need a proxy or manual login.');
  }

  switch (category) {
    case ItemCategory.Movie:
      return buildMovieItem(doc);
    case ItemCategory.Music:
      return buildMusicItem(doc);
    case ItemCategory.Book:
      return buildBookItem(doc);
    case ItemCategory.Game:
      return buildGameItem(doc);
    case ItemCategory.Drama:
      return buildDramaItem(doc);
    default:
      return {}
  }
}

const ImgSelector = '#mainpic img';
const ImgDefaultTitle = {
  Poster: '点击看更多海报',
  Cover: '点击上传封面图片',
};
const InfoSelector = '#info span.pl';

function buildMovieItem(doc: Document) {
  const title = doc.querySelector('#content h1 [property="v:itemreviewed"]')?.textContent?.trim() || '';
  const year = doc.querySelector('#content h1 .year')?.textContent?.slice(1, -1) || '';
  const img = doc.querySelector(ImgSelector) as HTMLImageElement;
  const poster = img?.title === ImgDefaultTitle.Poster ? img?.src?.trim().replace(/\.webp$/, '.jpg') : '';

  const infoPl = [...doc.querySelectorAll(InfoSelector)];
  const directorPl = infoPl.filter(i => i.textContent === '导演');
  const directors = (directorPl.length ? directorPl[0] : infoPl[0]).nextElementSibling?.textContent?.trim() || '';
  const actorsPl = infoPl.filter(i => i.textContent === '主演');
  const actors = actorsPl.length
    ? [...actorsPl[0].nextElementSibling?.querySelectorAll('span a')!]
      .slice(0, 5).map(i => i.textContent).join(' / ')
    : '';
  const writersPl = infoPl.filter(i => i.textContent === '编剧');
  const writers = writersPl.length
    ? [...writersPl[0].nextElementSibling?.querySelectorAll('span a')!]
      .slice(0, 5).map(i => i.textContent).join(' / ')
    : '';

  const genre = [...doc.querySelectorAll('#info [property="v:genre"]')].map(i => i.textContent || '').filter(v => v);
  const imdbInfo = [...doc.querySelectorAll(InfoSelector)].filter(i => i.textContent?.startsWith('IMDb'));
  const imdbLink = imdbInfo.length ? 'https://www.imdb.com/title/' + imdbInfo[0].nextSibling?.textContent?.trim() : '';

  return {
    [DB_PROPERTIES.NAME]: title,
    [DB_PROPERTIES.MOVIE_TITLE]: title,
    [DB_PROPERTIES.YEAR]: year,
    [DB_PROPERTIES.POSTER]: poster, // optional
    [DB_PROPERTIES.DIRECTORS]: directors,
    [DB_PROPERTIES.SCREENWRITERS]: writers, // optional
    [DB_PROPERTIES.ACTORS]: actors,
    [DB_PROPERTIES.GENRE]: genre,
    [DB_PROPERTIES.IMDB_LINK]: imdbLink, // optional
  };
}

function buildMusicItem(doc: Document) {
  const title = doc.querySelector('#wrapper h1 span')?.textContent?.trim() || '';
  const img = doc.querySelector(ImgSelector) as HTMLImageElement;
  const cover = img?.title !== ImgDefaultTitle.Cover && img?.src.length <= 100 ? img?.src.replace(/\.webp$/, '.jpg') : '';
  const info = [...doc.querySelectorAll(InfoSelector)];
  const release = info.filter(i => i.textContent?.trim().startsWith('发行时间'));
  let releaseDate = '';
  if (release.length) {
    const text = release[0].nextSibling?.textContent?.trim() || '';
    if (/\d{4}-\d/.test(text) && text) {
      releaseDate = dayjs(text).format('YYYY-MM-DD');
    } else if (/\d{4}年\d{1,2}月\d{2}日/.test(text)) {
      // BUG: example: https://music.douban.com/subject/2375247/
      // 发行时间是中文格式，非`YYYY-MM-DD`
      const match = text.match(/(\d{4})年(\d{1,2})月(\d{2})日/);
      releaseDate = dayjs(`${match![1]}-${match![2]}-${match![3]}`).format('YYYY-MM-DD');
    }
  }
  const musicianElems = info.filter((i) => i.textContent?.trim().startsWith('表演者'));
  // split and trim to remove extra spaces, rich_text length limited to 2000
  const musician = musicianElems.length
    ? musicianElems[0].textContent?.replace('表演者:', '').trim()
      .split('\n').map((v) => v.trim()).join('')
    : '';

  return {
    [DB_PROPERTIES.MUSIC_TITLE]: title,
    [DB_PROPERTIES.NAME]: title,
    [DB_PROPERTIES.COVER]: cover, // optional
    [DB_PROPERTIES.RELEASE_DATE]: releaseDate, // optional
    [DB_PROPERTIES.MUSICIAN]: musician, // optional
  };
}

function buildBookItem(doc: Document) {
  const title = doc.querySelector('#wrapper h1 [property="v:itemreviewed"]')?.textContent?.trim() || '';
  const img = doc.querySelector(ImgSelector) as HTMLImageElement;
  const cover = img?.title !== ImgDefaultTitle.Cover && img?.src.length <= 100 ? img?.src.replace(/\.webp$/, '.jpg') : '';
  const info = [...doc.querySelectorAll(InfoSelector)];

  let writer = '', publisher = '', bookTitle = title, publishDate = '', isbn = 0;
  info.forEach(i => {
    const text = i.textContent?.trim() || '';
    // nextSibling 也可能是个空的 #text node
    let nextText = i.nextSibling?.textContent?.trim() || i.nextElementSibling?.textContent?.trim() || '';

    if (text.startsWith('作者')) {
      writer = i.parentElement?.id === 'info'
        // if only one writer, then parentElement is the #info container
        ? i.nextElementSibling?.textContent?.replace(/\n/g, '').replace(/\s/g, '') || ''
        // if multiple writers, there will be a separate <span> element
        : i.parentElement?.textContent?.trim().replace('作者:', '').trim() || '';

    } else if (text.startsWith('出版社')) {
      // nextSibling 也可能是个空的 #text node，则需要跳过
      publisher = (i.nextElementSibling?.tagName === 'BR' || !i.nextSibling?.textContent?.trim())
        ? nextText
        // 出版社可能有单独链接 <a>上海三联书店</a>
        : i.parentElement?.textContent?.trim() || '';

    } else if (text.startsWith('原作名')) {
      bookTitle = title + nextText;

    } else if (text.startsWith('出版年')) {
      if (/年|月|日/.test(nextText)) {
        nextText = nextText.replace(/年|月|日/g, '-').slice(0, -1); // '2000年5月' special case
      }
      publishDate = dayjs(nextText).format('YYYY-MM-DD');

    } else if (text.startsWith('ISBN')) {
      isbn = Number(nextText);
    }
  });

  return {
    [DB_PROPERTIES.NAME]: title,
    [DB_PROPERTIES.COVER]: cover, // optional
    [DB_PROPERTIES.WRITER]: writer, // optional
    [DB_PROPERTIES.PUBLISHING_HOUSE]: publisher, // optional
    [DB_PROPERTIES.BOOK_TITLE]: bookTitle, // optional
    [DB_PROPERTIES.PUBLICATION_DATE]: publishDate, // optional
    [DB_PROPERTIES.ISBN]: isbn, // optional
  };
}

function buildGameItem(doc: Document) {
  const title = doc.querySelector('#wrapper #content h1')?.textContent?.trim() || '';
  const img = doc.querySelector('.item-subject-info .pic img') as HTMLImageElement;
  const cover = img?.title !== ImgDefaultTitle.Cover && img?.src.length <= 100 ? img?.src.replace(/\.webp$/, '.jpg') : '';
  // attributes class name seems to have changed to `thing-attr` instead of `game-attr`
  const gameInfo = doc.querySelector('#content .game-attr') || doc.querySelector('#content .thing-attr') as Element;
  const dts = [...gameInfo.querySelectorAll('dt')];
  const genre: string[] = [];
  let releaseDate = '';
  dts.forEach(dt => {
    if (dt.textContent?.startsWith('类型')) {
      const strs = [...dt.nextElementSibling!.querySelectorAll('a')].map((a) => a.textContent?.trim() || '').filter(v => v);
      genre.push(...strs);
    } else if (dt.textContent?.startsWith('发行日期')) {
      const date = dt.nextElementSibling?.textContent?.trim() || '';
      releaseDate = date ? dayjs(date).format('YYYY-MM-DD') : '';
    }
  });

  return {
    [DB_PROPERTIES.GAME_TITLE]: title,
    [DB_PROPERTIES.NAME]: title,
    [DB_PROPERTIES.COVER]: cover, // optional
    [DB_PROPERTIES.GENRE]: genre, // optional string[]
    [DB_PROPERTIES.RELEASE_DATE]: releaseDate, // optional
  }
}

function buildDramaItem(doc: Document) {
  const title = doc.querySelector('#content .drama-info .meta h1')?.textContent?.trim() || '';
  const genre = doc.querySelector('#content .drama-info .meta [itemprop="genre"]')?.textContent?.trim() || '';
  const img = doc.querySelector('.drama-info .pic img') as HTMLImageElement;
  const poster = img?.title !== ImgDefaultTitle.Cover && img?.src.length <= 100 ? img?.src.replace(/\.webp$/, '.jpg') : '';
  return {
    [DB_PROPERTIES.DRAMA_TITLE]: title,
    [DB_PROPERTIES.NAME]: title,
    [DB_PROPERTIES.POSTER]: poster, // optional
    [DB_PROPERTIES.GENRE]: genre ? [genre] : [], // optional
  };
}
