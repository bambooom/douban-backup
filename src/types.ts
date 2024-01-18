import Parser from 'rss-parser';
import DB_PROPERTIES from '../cols.json';

export enum ItemCategory {
  Movie = 'movie',
  Music = 'music',
  Book = 'book',
  Game = 'game',
  Drama = 'drama',
};

// follow the schema value of Neodb
export enum ItemStatus {
  Wishlist = 'wishlist',
  Progress = 'progress',
  Complete = 'complete',
};

export type RSSFeedItem = {
  [key: string]: any;
} & Parser.Item;

export type FeedItem = {
  id: string;
  link: string;
  rating: number | null;
  comment: string | null;
  time: string;
  status: ItemStatus;
  category: ItemCategory;
};

export type NotionRichTextPropType = {
  id?: string;
  type: 'rich_text';
  rich_text: {
    type: 'text';
    text: {
      content: string;
    };
  }[];
};

export type NotionTitlePropType = {
  id?: 'title';
  type: 'title';
  title: {
    text: {
      content: string;
    };
  }[];
};

export type NotionFilesPropType = {
  id?: string;
  type: 'files';
  files: {
    name: string;
    type: 'external';
    external: {
      url: string;
    };
  }[];
};

export type NotionDatePropType = {
  id?: string;
  type: 'date';
  date: {
    start: string;
    end: string | null;
    time_zone: string | null;
  };
};

export type NotionMultiSelectPropType = {
  id?: string;
  type: 'multi_select';
  multi_select: {
    name: string;
  }[];
};

export type NotionNumberPropType = {
  id?: string;
  type: 'number';
  number: number | null;
};

export type NotionUrlPropType = {
  id?: string;
  type: 'url';
  url: string;
};
