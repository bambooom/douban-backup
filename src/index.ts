import dotenv from 'dotenv';
import fetchRSSFeeds from './fetch-rss';
import handleFeeds from './handle-feeds';
import handleNotion from './handle-notion';
import { type ItemCategory, ItemStatus } from './types';
import { getDBID } from './utils';

dotenv.config();

const neodbToken = process.env.NEODB_API_TOKEN;


async function main(): Promise<void> {
  const feeds = await fetchRSSFeeds();
  if (feeds.length === 0) {
    console.log('No new items.');
    return;
  }

  const normalizedFeeds = handleFeeds(feeds);
  const completeFeeds = normalizedFeeds.filter(f => f.status === ItemStatus.Complete);


  if (completeFeeds.length) {
    await handleNotion(completeFeeds);
  }
}

main();
