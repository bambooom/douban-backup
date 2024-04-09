import dotenv from 'dotenv';
import got from 'got';
import { consola } from 'consola';
import type { FeedItem, ItemCategory } from "./types";
import { sleep } from './utils';

dotenv.config();
const neodbToken = process.env.NEODB_API_TOKEN;

type NeodbItem = {
  id: string;
  type: string;
  uuid: string;
  url: string;
  api_url: string;
  category: ItemCategory;
  parent_uuid: string;
  display_title: string;
  external_resources: {
    url: string;
  }[],
  title: string;
  brief: string;
  cover_image_url: string;
  rating: number;
  rating_count: number;
};

/**
 * Asynchronously handles syncing feed items to NeoDB.
 *
 * @param {FeedItem[]} feeds - the array of feed items to sync
 * @return {Promise<void>}
 */
export default async function handleNeodb(feeds: FeedItem[]): Promise<void> {
  if (!neodbToken) {
    return;
  }

  consola.start('Going to sync to NeoDB...');
  // 同步标记到 neodb
  for (const item of feeds) {
    await insertToNeodb(item);
  }
  consola.success('NeoDB synced ✨');
}

/**
 * Inserts a FeedItem into Neodb and first fetching the item's data to check
 * whether need to update the status.
 *
 * @param {FeedItem} item - the FeedItem to be inserted into Neodb
 * @return {Promise<void>} a Promise that resolves when the insertion is complete
 */
async function insertToNeodb(item: FeedItem): Promise<void> {
  // fetch item by douban link
  const neodbItem = await got('https://neodb.social/api/catalog/fetch', {
    searchParams: {
      url: item.link,
    },
    headers: {
      accept: 'application/json',
    },
  }).json() as NeodbItem;
  // 条目不存在的话会被创建，但此时会返回 {message: 'Fetch in progress'}
  if (neodbItem.uuid) {
    try {
      const mark = await got(
        `https://neodb.social/api/me/shelf/item/${neodbItem.uuid}`,
        {
          headers: {
            Authorization: `Bearer ${neodbToken}`,
            accept: 'application/json',
          },
        }
      ).json() as any;
      if (mark.shelf_type !== item.status) {
        // 标记状态不一样，所以更新标记
        await markItem(neodbItem, item);
      }
    } catch (error) {
      if (error.code === 'ERR_NON_2XX_3XX_RESPONSE') {
        // 标记不存在，所以创建标记
        await markItem(neodbItem, item);
      }
    }
  } else {
    // 标记不存在，等待一点时间创建标记再去标记
    await sleep(1500);
    await insertToNeodb(item);
  }
}

/**
 * Marks an item on NeoDB with the specified parameters.
 *
 * @param {NeodbItem} neodbItem - the NeodbItem to be marked
 * @param {FeedItem} item - the FeedItem containing information about the item
 * @return {Promise<void>} a Promise that resolves when the item is successfully marked
 */
async function markItem(neodbItem: NeodbItem, item: FeedItem): Promise<void> {
  consola.info('Going to mark on NeoDB: ', `${neodbItem.title}[${item.link}]`);
  try {
    await got.post(`https://neodb.social/api/me/shelf/item/${neodbItem.uuid}`, {
      headers: {
        Authorization: `Bearer ${neodbToken}`,
        accept: 'application/json',
      },
      json: {
        shelf_type: item.status,
        visibility: 2,
        comment_text: item.comment || '',
        rating_grade: item.rating ? item.rating * 2 : 0,
        created_time: item.time,
        post_to_fediverse: false,
      },
    });
  } catch (error) {
    consola.error(
      'Failed to mark item: ', neodbItem?.title,
        ' with error: ',
      error
    );
  }
}
