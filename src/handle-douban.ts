import got from 'got';
import { JSDOM } from 'jsdom';
import { ItemCategory } from "./types";

export default async function scrapyDouban(link: string, category: ItemCategory) {
  console.log(`Scraping ${category} item with link: ${link}`);
  const response = await got(link);
  const dom = new JSDOM(response.body);

  // @todo 分类处理
}
