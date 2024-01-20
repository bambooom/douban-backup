import Parser from 'rss-parser';
import dotenv from 'dotenv';
import { JSDOM } from 'jsdom';
import {
  ALL_STATUS,
  RATING_TEXT,
  SeeState,
  ReadState,
  PlayState,
  ListenState,
} from './const';
import {
  ItemCategory,
  ItemStatus,
  type RSSFeedItem,
  type FeedItem,
} from './types';

type ItemInfo = {
  category: ItemCategory;
  id: string;
  status: ItemStatus;
}

dotenv.config();

export async function fetchRSSFeeds(): Promise<RSSFeedItem[]> {
  const DOUBAN_USER_ID = process.env.DOUBAN_USER_ID;
  const parser = new Parser();
  try {
    const feeds = await parser.parseURL(
      `https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`
    );
    return feeds.items;
  } catch (error) {
    console.error('Failed to parse RSS url: ', error);
    process.exit(1);
  }
}

/**
 * Normalize the given array of RSS feed items.
 *
 * @param {RSSFeedItem[]} feeds - The array of RSS feed items to be normalized.
 * @return {FeedItem[]} The normalized array of feed items.
 */
export function handleRSSFeeds(feeds: RSSFeedItem[]): FeedItem[] {
  const normalizedFeeds: FeedItem[] = [];

  feeds.forEach((item) => {
    const itemInfo = extractItemInfo(item.title!, item.link!);
    if (!itemInfo) {
      return;
    }
    const { category, id, status } = itemInfo;
    const dom = new JSDOM(item.content!.trim());
    const contents = [...dom.window.document.querySelectorAll('td p')];
    const ratingElements = contents.filter((el) => el.textContent!.startsWith('推荐'));
    let ratingNumber = 0;
    if (ratingElements.length) {
      const rating = ratingElements[0].textContent!.replace(/^推荐: /, '').trim();
      ratingNumber = RATING_TEXT[rating];
    }
    const commentElements = contents.filter((el) => el.textContent!.startsWith('备注'));
    let comment = '';
    if (commentElements.length) {
      comment = commentElements[0].textContent!.replace(/^备注: /, '').trim();
    }
    const result = {
      id,
      link: item.link,
      rating: ratingNumber || null,
      comment: typeof comment === 'string' ? comment : null, // 备注：XXX -> 短评
      time: item.isoDate, // '2021-05-30T06:49:34.000Z'
      status,
      category,
    } as FeedItem;
    normalizedFeeds.push(result);
  });

  return normalizedFeeds;
}


/**
 * Extracts the category, ID, and status from the given title and link
 * which are from RSS feed item.
 *
 * @param {string} title - The title to extract the information from.
 * @param {string} link - The link to extract the information from.
 * @return {ItemInfo} An object containing the extracted category, ID, and status.
 */
export function extractItemInfo(title: string, link: string): ItemInfo | undefined {
  const m = title.match(ALL_STATUS)?.[1];

  if (!m) {
    return;
  }

  if (Object.keys(SeeState).includes(m)) {
    const isMovie = link.startsWith('http://movie.douban.com/');
    return {
      category: isMovie ? ItemCategory.Movie : ItemCategory.Drama,
      id: isMovie
        ? link.match(/movie\.douban\.com\/subject\/(\d+)\/?/)?.[1]!
        : link.match(/www\.douban\.com\/location\/drama\/(\d+)\/?/)?.[1]!,
      status: SeeState[m],
    };
  } else if (Object.keys(ReadState).includes(m)) {
    return {
      category: ItemCategory.Book,
      id: link.match(/book\.douban\.com\/subject\/(\d+)\/?/)?.[1]!,
      status: ReadState[m],
    };
  } else if (Object.keys(ListenState).includes(m)) {
    return {
      category: ItemCategory.Music,
      id: link.match(/music\.douban\.com\/subject\/(\d+)\/?/)?.[1]!,
      status: ListenState[m],
    };
  } else if (Object.keys(PlayState).includes(m)) {
    return {
      category: ItemCategory.Game,
      id: link.match(/www\.douban\.com\/game\/(\d+)\/?/)?.[1]!,
      status: PlayState[m],
    };
  }

  return;
}
