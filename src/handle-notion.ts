import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import scrapyDouban from './handle-douban';
import { getDBID } from './utils';
import DB_PROPERTIES from '../cols.json';
import {
  ItemCategory,
  ItemStatus,
  type RSSFeedItem,
  type FeedItem,
  type NotionUrlPropType,
} from './types';

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
    await syncNotion(categorizedFeeds, category as ItemCategory);
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

  const queryItems = await notion.databases.query({
    database_id: dbID,
    filter: {
      or: categorizedFeeds.map((item) => ({
        property: DB_PROPERTIES.ITEM_LINK,
        url: {
          contains: item.id,
        },
      })),
    },
  }).catch((error) => {
    console.error(`Failed to query ${category} database to check already inserted items. `, error);
    process.exit(1);
  });

  const alreadyInsertedItems = new Set(queryItems.results.map((i) => {
    if ('properties' in i) {
      return (i.properties[DB_PROPERTIES.ITEM_LINK] as NotionUrlPropType).url;
    }
    return;
  }).filter(v => v));

  const newFeeds = categorizedFeeds.filter((item) => {
    return !alreadyInsertedItems.has(item.link);
  });

  console.log(`There are total ${newFeeds.length} new ${category} item(s) need to insert.`);

  for (const newFeedItem of newFeeds) {
    await scrapyDouban(newFeedItem.link, category);
  }
}
