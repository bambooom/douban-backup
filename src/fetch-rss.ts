import Parser from 'rss-parser';
import dotenv from 'dotenv';
import type { RSSFeedItem } from './types';

dotenv.config();

export default async function fetchRSSFeeds(): Promise<RSSFeedItem[]> {
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
