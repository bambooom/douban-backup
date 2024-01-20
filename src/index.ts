import dotenv from 'dotenv';
import fetchRSSFeeds from './fetch-rss';
import handleRSSFeeds from './handle-rss';
import handleNotion from './handle-notion';
import { ItemStatus } from './types';

dotenv.config();

const neodbToken = process.env.NEODB_API_TOKEN;


async function main(): Promise<void> {
  const feeds = await fetchRSSFeeds();
  if (feeds.length === 0) {
    console.log('No new items.');
    return;
  }

  const normalizedFeeds = handleRSSFeeds(feeds);
  const completeFeeds = normalizedFeeds.filter(f => f.status === ItemStatus.Complete);

  if (completeFeeds.length) {
    await handleNotion(completeFeeds);
  }
}

main();
