import Parser from 'rss-parser';

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
