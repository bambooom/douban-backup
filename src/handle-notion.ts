import dayjs from 'dayjs';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { type CreatePageParameters } from '@notionhq/client/build/src/api-endpoints';
import scrapyDouban from './handle-douban';
import { getDBID, sleep, buildPropertyValue } from './utils';
import { PropertyTypeMap, EMOJI } from './const';
import DB_PROPERTIES from '../cols.json';
import {
  ItemCategory,
  type FeedItem,
  type NotionUrlPropType,
  type DB_PROPERTIES_KEYS,
  type FailedItem,
} from './types';

// https://github.com/makenotion/notion-sdk-js/issues/280#issuecomment-1178523498
type EmojiRequest = Extract<CreatePageParameters['icon'], { type?: 'emoji'; }>['emoji'];

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

/**
 * Asynchronously handles the Notion feeds by grouping them by category and then
 * syncing the categorized feeds to the Notion database as one category corresponding
 * to one Notion database.
 *
 * @param {FeedItem[]} feeds - The array of feed items to be handled
 * @return {Promise<void>} A promise that resolves when all feeds are synced to
 * the Notion database
 */
export default async function handleNotion(feeds: FeedItem[]): Promise<void> {
  const groupByCategory: Partial<Record<ItemCategory, FeedItem[]>> = feeds.reduce(
    (acc, feed) => {
      if (!acc[feed.category]) {
        acc[feed.category] = [];
      }
      acc[feed.category]!.push(feed);
      return acc;
    },
    {} as Partial<Record<ItemCategory, FeedItem[]>>,
  );

  const AllFailedItems: FailedItem[] = [];

  for (const category in groupByCategory) {
    try {
      const categorizedFeeds = groupByCategory[category] as FeedItem[];
      const failed = await syncNotionDB(categorizedFeeds, category as ItemCategory);
      if (failed) {
        AllFailedItems.push(...failed);
      }
    } catch (error) {
      console.error(`Failed to handle ${category} feeds. `, error);
      process.exit(1);
    }
  }

  if (AllFailedItems.length) {
    console.log('Failed to handle the following feeds to insert into Notion:');
    for (const item of AllFailedItems) {
      console.log(`${item.title}: ${item.link}`);
    }
    process.exit(1);
  }
}

/**
 * Asynchronously synchronizes the Notion database with categorized feeds.
 *
 * @param {FeedItem[]} categorizedFeeds - the array of categorized feed items
 * @param {ItemCategory} category - the category of the feed items
 * @return {Promise<FailedItem[] | undefined>} an array of failed items or undefined
 */
async function syncNotionDB(categorizedFeeds: FeedItem[], category: ItemCategory): Promise<FailedItem[] | undefined> {
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

  const failedItems: FailedItem[] = [];

  for (const newFeedItem of newFeeds) {
    try {
      const itemData = await scrapyDouban(newFeedItem.link, category);
      itemData[DB_PROPERTIES.ITEM_LINK] = newFeedItem.link;
      itemData[DB_PROPERTIES.RATING] = newFeedItem.rating;
      itemData[DB_PROPERTIES.RATING_DATE] = dayjs(newFeedItem.time).format('YYYY-MM-DD');
      itemData[DB_PROPERTIES.COMMENTS] = newFeedItem.comment;
      const successful = await addItemToNotion(itemData, category);
      if (!successful) {
        failedItems.push({
          link: newFeedItem.link,
          title: itemData.title as string,
        });
      }
      await sleep(1000);

    } catch (error) {
      console.error(error);
      continue;
    }
  }

  if (failedItems.length) {
    console.log(`Failed to insert ${failedItems.length} items into ${category} Notion database.`);
  }
  console.log(`${category} feeds done.`);
  console.log('====================');
  return failedItems;
}

/**
 * Insert an item to Notion database.
 *
 * @param {object} itemData - The data of the item to be added to the Notion database.
 * @param {ItemCategory} category - The category of the item.
 * @return {boolean} Indicates whether the item was successfully added to the database.
 */
async function addItemToNotion(itemData: {
    [key: string]: string | string[] | number | null | undefined;
}, category: ItemCategory): Promise<boolean> {
  console.log(
    'Going to insert ',
    itemData[DB_PROPERTIES.RATING_DATE],
    itemData[DB_PROPERTIES.NAME]
  );
  try {
    const properties: Record<string, any> = {};
    const keys = Object.keys(DB_PROPERTIES) as DB_PROPERTIES_KEYS[];
    keys.shift(); // remove fist one NAME
    keys.forEach((key) => {
      if (itemData[DB_PROPERTIES[key]]) {
        properties[DB_PROPERTIES[key]] = buildPropertyValue(
          itemData[DB_PROPERTIES[key]],
          PropertyTypeMap[key],
          DB_PROPERTIES[key]
        );
      }
    });

    const dbid = getDBID(category);
    if (!dbid) {
      throw new Error('No databse id found for category: ' + category);
    }

    const db = await notion.databases.retrieve({ database_id: dbid });
    const columns = Object.keys(db.properties);
    // remove cols which are not in the current database
    const propKeys = Object.keys(properties);
    propKeys.map((prop) => {
      if (columns.indexOf(prop) < 0) {
        delete properties[prop];
      }
    });

    const postData: CreatePageParameters = {
      parent: {
        database_id: dbid,
      },
      icon: {
        type: 'emoji',
        emoji: EMOJI[category] as EmojiRequest,
      },
      // fill in properties by the format: https://developers.notion.com/reference/page#page-property-value
      properties,
    };

    if (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER]) {
      // use poster for the page cover
      postData.cover = {
        type: 'external',
        external: {
          url: (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER])?.files[0]?.external?.url, // cannot be empty string or null
        },
      };
    }

    const response = await notion.pages.create(postData);
    if (response && response.id) {
      console.log(
        itemData[DB_PROPERTIES.NAME] +
          `[${itemData[DB_PROPERTIES.ITEM_LINK]}]` +
          ' page inserted into Notion database.'
      );
    }
    return true;
  } catch (error) {
    console.warn(
      'Failed to create ' +
        itemData[DB_PROPERTIES.NAME] +
        `(${itemData[DB_PROPERTIES.ITEM_LINK]})` +
        ' with error: ',
      error
    );
    return false;
  }
}
