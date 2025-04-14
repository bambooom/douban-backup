import {consola} from 'consola';
import {Client} from '@notionhq/client';
import DB_PROPERTIES from '../cols.json';
import {updateItemToNotion} from './handle-notion';

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
});

async function main() {
    const databaseId = process.env.NOTION_MOVIE_DATABASE_ID;
    if (!databaseId) throw new Error('Missing NOTION_DATABASE_ID');

    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
        const response = await notion.databases.query({
            database_id: databaseId,
            start_cursor: startCursor,
            page_size: 100,
        });

        for (const page of response.results) {
            if ('properties' in page) {
                const urlProp = page.properties[DB_PROPERTIES.ITEM_LINK];
                const currentUrl = (urlProp as any)?.url;

                if (currentUrl?.startsWith('http://')) {
                    const newUrl = currentUrl.replace('http://', 'https://');
                    await updateItemToNotion(
                        {[DB_PROPERTIES.ITEM_LINK]: newUrl},
                        'movie', // 根据实际情况调整类型
                        page.id
                    );
                }
            }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor;
    }
}

main().catch(consola.error);