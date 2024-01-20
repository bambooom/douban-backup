import dotenv from 'dotenv';
import { ItemCategory, NotionPropTypesEnum } from './types';
import DB_PROPERTIES from '../cols.json';

dotenv.config();

/**
 * Retrieves the database ID for the given category.
 *
 * @param {ItemCategory} category - The category of the item.
 * @returns {string} The corresponding database ID.
 */
export function getDBID(category: ItemCategory): string {
  const databasesMap = {
    [ItemCategory.Movie]: process.env.NOTION_MOVIE_DATABASE_ID,
    [ItemCategory.Music]: process.env.NOTION_MUSIC_DATABASE_ID,
    [ItemCategory.Book]: process.env.NOTION_BOOK_DATABASE_ID,
    [ItemCategory.Game]: process.env.NOTION_GAME_DATABASE_ID,
    [ItemCategory.Drama]: process.env.NOTION_DRAMA_DATABASE_ID,
  };
  return databasesMap[category] as string;
}

/**
 * Delays the execution of a function by a specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to sleep
 * @return {Promise<void>} A Promise that resolves after the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generates the value for a property based on the given parameters, ready to insert
 * into notion database.
 *
 * @param {any} value - the value to be processed
 * @param {NotionPropTypesEnum} type - the type of the Notion database property
 * @param {string} key - the key associated with the property
 * @return {any} the generated value for the property later will be sent to notion to create an item
 */
export function buildPropertyValue(value: any, type: NotionPropTypesEnum, key: string): Record<string, any> | undefined {
  switch (type) {
    case NotionPropTypesEnum.TITLE:
      return {
        type: NotionPropTypesEnum.TITLE,
        title: [
          {
            text: {
              content: value,
            },
          },
        ],
      };
    case NotionPropTypesEnum.FILES:
      return {
        type: NotionPropTypesEnum.FILES,
        files: [
          {
            name: value,
            type: 'external',
            external: {
              url: value
            },
          },
        ],
      };
    case NotionPropTypesEnum.DATE:
      return {
        type: NotionPropTypesEnum.DATE,
        date: {
          start: value,
        },
      };
    case NotionPropTypesEnum.MULTI_SELECT:
      return key === DB_PROPERTIES.RATING
        ? {
          type: NotionPropTypesEnum.MULTI_SELECT,
          multi_select: value
            ? [{ name: value.toString() }]
            : [],
        }
        : {
          type: NotionPropTypesEnum.MULTI_SELECT,
          multi_select: (value || []).map(g => ({ name: g })),
        };
    case NotionPropTypesEnum.RICH_TEXT:
      return {
        type: NotionPropTypesEnum.RICH_TEXT,
        rich_text: [
          {
            type: 'text',
            text: {
              content: value || '',
            },
          },
        ],
      };
    case NotionPropTypesEnum.NUMBER:
      return {
        type: NotionPropTypesEnum.NUMBER,
        number: value ? Number(value) : null,
      };
    case NotionPropTypesEnum.URL:
      return {
        type: NotionPropTypesEnum.URL,
        url: value,
      };
    default:
      break;
  }
}
