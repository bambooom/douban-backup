# README

首先感谢大佬[bambooom](https://github.com/bambooom)的付出，然后在这里记录一下自己的实践过程。

## 1、油猴脚本导出csv

安装[油猴脚本](https://greasyfork.org/zh-CN/scripts/420999-%E8%B1%86%E7%93%A3%E8%AF%BB%E4%B9%A6-%E7%94%B5%E5%BD%B1-%E9%9F%B3%E4%B9%90-%E6%B8%B8%E6%88%8F-%E8%88%9E%E5%8F%B0%E5%89%A7%E5%AF%BC%E5%87%BA%E5%B7%A5%E5%85%B7)→导出csv

## 2、保存Notion模板副本，并导入csv

- [movie template（新）](https://htyed.notion.site/cd4657d7229b41ff82efb1fce255dca5?v=40bf1445ed5144c5b9694cb4f6930c65)
- [book template](https://bambooo.notion.site/2c6d35b0e1414af387f9e2a20d10cb4c?v=33be13cbae1f4bf581d325dfa1fa5604)
- [music template](https://bambooo.notion.site/43a25b0e62354cc4a38a8aa0c60ac31c?v=45b0b31a85804b42a8993e99b63e3f47)
- [game template](https://bambooo.notion.site/0fcb63ccfc65455b9349b29685690b71?v=5fc35837865640fe8e008ef80961d87f)
- [drama templa](https://bambooo.notion.site/29233844d4e34a9eb6fd48fb0a7b1598?v=8e9681e173204853b3df0d8c10f0e549)

新增：在电影页面增加一列 制片国家/地区，属性选择文本
## 3、用脚本补全信息

使用 `update-notion.js` 脚本，用最新的 csv 文件作为输入，将刮削等待时间改成30s（防止被禁IP，但好像保证一分钟小于40次访问就可以，反正在后台慢慢运行，也不急），选择0模式（不跳过）

## 4、通过rss更新最新十条豆瓣信息

使用 `sync-rss.js` 脚本获取 RSS 数据，对新加入的条目进行抓取信息，处理后添加到对应的 notion database 中即可。

定时运行可以用 GitHub Actions 跑 [scheduled workflow](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule)、青龙面板跑定时任务、等等。

## todo

- [x] 添加制片国家
- [x] 将 *想看* 同步
- [ ] 将 *想看* 与 *看过* 在Notion中区分开（目前只能手动调整）

## 同类项目

Douban-backup（本项目大佬教程）：https://zhuzi.dev/2021/06/05/douban-backup-sync-notion/

Notion_sync_data：https://github.com/Qliangw/notion_sync_data

Notion API × 豆瓣电影/图书：https://djdjs.notion.site/djdjs/Notion-API-7fe0ab77c9ba49d1bb1bbd7963a502dc

