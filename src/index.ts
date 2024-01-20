import { fetchRSSFeeds, handleRSSFeeds } from './handle-rss';
import handleNotion from './handle-notion';
import handleNeodb from './handle-neodb';
import { ItemStatus } from './types';

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

  await handleNeodb(normalizedFeeds);
}

main();
