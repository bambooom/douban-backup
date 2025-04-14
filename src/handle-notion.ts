import {consola} from 'consola';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import {Client} from '@notionhq/client';
import {type CreatePageParameters} from '@notionhq/client/build/src/api-endpoints';
import scrapyDouban from './handle-douban';
import {buildPropertyValue, getDBID, sleep} from './utils';
import {EMOJI, PropertyTypeMap} from './const';
import DB_PROPERTIES from '../cols.json';
import {
    type DB_PROPERTIES_KEYS,
    type FailedItem,
    type FeedItem,
    ItemCategory,
    ItemStatus,
    type NotionUrlPropType,
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
            consola.error(`Failed to handle ${category} feeds. `, error);
            process.exit(1);
        }
    }

    if (AllFailedItems.length) {
        consola.warn('Failed to handle the following feeds to insert into Notion:');
        for (const item of AllFailedItems) {
            consola.warn(`${item.title}: ${item.link}`);
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
        consola.info(`No new ${category} feeds.`);
        return;
    }

    const dbID = getDBID(category);
    if (!dbID) {
        consola.warn(`No notion database id for ${category}`);
        return;
    }

    consola.start(`Handling ${category} feeds...`);

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
        consola.error(`Failed to query ${category} database to check already inserted items. `, error);
        process.exit(1);
    });

    const alreadyInsertedItems = new Set(queryItems.results.map((i) => {
        if ('properties' in i) {
            return (i.properties[DB_PROPERTIES.ITEM_LINK] as NotionUrlPropType).url;
        }
        return;
    }).filter(v => v));

    const newFeeds = categorizedFeeds
        .filter((item) => {
            return !alreadyInsertedItems.has(item.link);
        });

    const needUpdateFeeds = categorizedFeeds
        .filter((item) => {
            return alreadyInsertedItems.has(item.link);
        });

    consola.info(`There are total ${newFeeds.length} new ${category} item(s) need to insert.`);
    consola.info(`There are total ${needUpdateFeeds.length} ${category} item(s) need to update.`);

    const failedItems: FailedItem[] = [];

    // 处理新增条目
    for (const newFeedItem of newFeeds) {
        try {
            const pubTime = dayjs(newFeedItem.time).format('YYYY-MM-DD');
            const itemData = await scrapyDouban(newFeedItem.link, category);
            itemData[DB_PROPERTIES.ITEM_LINK] = newFeedItem.link;
            itemData[DB_PROPERTIES.RATING] = newFeedItem.rating;
            if (newFeedItem.status == ItemStatus.Complete) {
                itemData[DB_PROPERTIES.RATING_DATE] = pubTime
            }
            if (newFeedItem.status == ItemStatus.Progress) {
                itemData[DB_PROPERTIES.START_TIME] = pubTime
            }
            itemData[DB_PROPERTIES.COMMENTS] = newFeedItem.comment;
            itemData[DB_PROPERTIES.STATUS] = newFeedItem.statusText;
            const successful = await addItemToNotion(itemData, category);
            if (!successful) {
                failedItems.push({
                    link: newFeedItem.link,
                    title: itemData.title as string,
                });
            }
            await sleep(1000);

        } catch (error) {
            consola.error(error);
            continue;
        }
    }

    // 处理需要更新的条目
    if (needUpdateFeeds.length > 0) {
        consola.start(`Updating ${needUpdateFeeds.length} existing ${category} items...`);

        // 首先获取所有需要更新的条目的页面ID
        const pageIds = await getPageIdsForItems(needUpdateFeeds, dbID);

        for (const updateFeedItem of needUpdateFeeds) {
            try {
                const pageId = pageIds.get(updateFeedItem.link);
                if (!pageId) {
                    consola.warn(`Cannot find page ID for item: ${updateFeedItem.link}, skipping update.`);
                    continue;
                }

                const itemData = await scrapyDouban(updateFeedItem.link, category);
                itemData[DB_PROPERTIES.ITEM_LINK] = updateFeedItem.link;
                itemData[DB_PROPERTIES.RATING] = updateFeedItem.rating;
                itemData[DB_PROPERTIES.RATING_DATE] = dayjs(updateFeedItem.time).format('YYYY-MM-DD');
                itemData[DB_PROPERTIES.COMMENTS] = updateFeedItem.comment;
                itemData[DB_PROPERTIES.STATUS] = updateFeedItem.statusText;

                const successful = await updateItemToNotion(itemData, category, pageId);
                if (!successful) {
                    failedItems.push({
                        link: updateFeedItem.link,
                        title: itemData.title as string,
                    });
                }
                await sleep(1000);
            } catch (error) {
                consola.error(error);
                continue;
            }
        }

        consola.success(`Updated ${needUpdateFeeds.length - failedItems.length} ${category} items.`);
    }

    if (failedItems.length) {
        consola.error(`Failed to process ${failedItems.length} items for ${category} Notion database.`);
    }
    consola.success(`${category} feeds done.`);
    consola.log('====================');
    return failedItems;
}

/**
 * 获取一组条目对应的Notion页面ID
 *
 * @param {FeedItem[]} items - 需要获取页面ID的条目
 * @param {string} dbID - Notion数据库ID
 * @return {Promise<Map<string, string>>} 条目链接到页面ID的映射
 */
async function getPageIdsForItems(items: FeedItem[], dbID: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    // 批量查询，避免多次API调用
    const queryResponse = await notion.databases.query({
        database_id: dbID,
        filter: {
            or: items.map((item) => ({
                property: DB_PROPERTIES.ITEM_LINK,
                url: {
                    equals: item.link,
                },
            })),
        },
    });

    for (const page of queryResponse.results) {
        if ('properties' in page) {
            const url = (page.properties[DB_PROPERTIES.ITEM_LINK] as NotionUrlPropType).url;
            if (url) {
                result.set(url, page.id);
            }
        }
    }

    return result;
}

/**
 * 更新Notion数据库中的一个条目
 *
 * @param {object} itemData - 要更新到Notion数据库的条目数据
 * @param {ItemCategory} category - 条目的类别
 * @param {string} pageId - Notion页面ID
 * @return {Promise<boolean>} 表示条目是否成功更新到数据库
 */
async function updateItemToNotion(itemData: {
    [key: string]: string | string[] | number | null | undefined;
}, category: ItemCategory, pageId: string): Promise<boolean> {
    consola.start(
        'Going to update ',
        itemData[DB_PROPERTIES.RATING_DATE],
        itemData[DB_PROPERTIES.NAME]
    );
    try {
        const properties: Record<string, any> = {};
        const keys = Object.keys(DB_PROPERTIES) as DB_PROPERTIES_KEYS[];
        keys.shift(); // remove first one NAME
        keys.forEach((key) => {
            if (itemData[DB_PROPERTIES[key]]) {
                // 新增HTTP协议升级逻辑
                let value = itemData[DB_PROPERTIES[key]];
                if (key === 'ITEM_LINK' && typeof value === 'string') {
                    value = value.replace(/^http:\/\//, 'https://');
                }
                
                properties[DB_PROPERTIES[key]] = buildPropertyValue(
                    value,  // 使用处理后的值
                    PropertyTypeMap[key],
                    DB_PROPERTIES[key]
                );
            }
        });

        const dbid = getDBID(category);
        if (!dbid) {
            throw new Error('No database id found for category: ' + category);
        }

        const db = await notion.databases.retrieve({database_id: dbid});
        const columns = Object.keys(db.properties);
        // remove cols which are not in the current database
        const propKeys = Object.keys(properties);
        propKeys.map((prop) => {
            if (columns.indexOf(prop) < 0) {
                delete properties[prop];
            }
        });

        // 更新页面属性
        const response = await notion.pages.update({
            page_id: pageId,
            properties,
            // 可以选择性地更新图标
            icon: {
                type: 'emoji',
                emoji: EMOJI[category] as EmojiRequest,
            },
        });

        // 更新封面图片
        if (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER]) {
            await notion.pages.update({
                page_id: pageId,
                cover: {
                    type: 'external',
                    external: {
                        url: (properties[DB_PROPERTIES.POSTER] || properties[DB_PROPERTIES.COVER])?.files[0]?.external?.url,
                    },
                },
            });
        }

        if (response && response.id) {
            consola.success(
                itemData[DB_PROPERTIES.NAME] +
                `[${itemData[DB_PROPERTIES.ITEM_LINK]}]` +
                ' page updated in Notion database.'
            );
        }
        return true;
    } catch (error) {
        consola.error(
            'Failed to update ' +
            itemData[DB_PROPERTIES.NAME] +
            `(${itemData[DB_PROPERTIES.ITEM_LINK]})` +
            ' with error: ',
            error
        );
        return false;
    }
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
    consola.start(
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

        const db = await notion.databases.retrieve({database_id: dbid});
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
            consola.success(
                itemData[DB_PROPERTIES.NAME] +
                `[${itemData[DB_PROPERTIES.ITEM_LINK]}]` +
                ' page inserted into Notion database.'
            );
        }
        return true;
    } catch (error) {
        consola.error(
            'Failed to create ' +
            itemData[DB_PROPERTIES.NAME] +
            `(${itemData[DB_PROPERTIES.ITEM_LINK]})` +
            ' with error: ',
            error
        );
        return false;
    }
}

export {
    updateItemToNotion
}
