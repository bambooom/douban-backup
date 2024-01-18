import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { ItemCategory, ItemStatus, type RSSFeedItem, type FeedItem } from './types';
import { getDBID } from './utils';

dotenv.config();

export default async function handleNotion(feeds: FeedItem[]) {
  const groupByCategory: Partial<Record<ItemCategory, FeedItem[]>> = feeds.reduce(
    (acc, feed) => {
      if (!acc[feed.category]) {
        acc[feed.category] = [];
      }
      acc[feed.category].push(feed);
      return acc;
    },
    {}
  );

  for (const category in groupByCategory) {
    const categorizedFeeds = groupByCategory[category] as FeedItem[];
  }
}

async function syncNotion(categorizedFeeds: FeedItem[], category: ItemCategory) {
  if (categorizedFeeds.length === 0) {
    console.log(`No new ${category} feeds.`);
    return;
  }

  const dbID = getDBID(category);
  if (!dbID) {
    console.log(`No notion database id for ${category}`);
    return;
  }

  console.log(`Handling ${category} feeds...`);

  const notion = new Client({
    auth: process.env.NOTION_TOKEN,
  });

  // const filtered = await notion.databases.query({
  //   database_id: dbID,
  //   filter: {
  //     or: categorizedFeeds.map((item) => ({
  //       property: DB_PROPERTIES.ITEM_LINK,
  //       url: {
  //         contains: item.id,
  //       },
  //     })),
  //   },
  // }).catch((error) => {
  //   console.error(`Failed to query ${category} database to check already inserted items. `, error);
  //   process.exit(1);
  // });
}
