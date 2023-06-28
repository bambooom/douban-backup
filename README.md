![sync-rss](https://github.com/bambooom/douban-backup/actions/workflows/sync-rss.js.yml/badge.svg)

> 详细教程 -> https://zhuzi.dev/2021/06/05/douban-backup-sync-notion/
>
> 油猴脚本 -> https://greasyfork.org/en/scripts/420999

## update notion database from csv

在前一次导出后过了一段时间，在豆瓣上又有新的标记，但没有简单方法可以同步，又不想手动添加。
终于等到了 notion public API 发布出来。

如果在豆瓣上又重新执行[油猴脚本（`export.user.js`）](https://greasyfork.org/en/scripts/420999)导出了一个更新的 csv 文件。
其中大多数都已经在上一次导出到 notion database 中。少数（大约 80 个）新条目需要更新到 database 中。

可以使用 `update-notion.js` 脚本，用最新的 csv 文件作为输入，跳过所有已经导入过的条目。
针对新的条目，一一去从页面获取扩展信息，并更新到 notion 中。
因为访问条目数比较少，所以不容易被禁 IP。

<details>
  <summary>example of one row of douban export.user.js csv data</summary>
  <pre>
{
  '标题': '无间双龙：这份爱，才是正义 / ウロボロス～この愛こそ正  義。',
  '个人评分': '5',
  '打分日期': '2015/03/21',
  '我的短评': '5星打的绝对不是剧情！为建国，为toma，为一众cast就  是如此任性ˊ_>ˋ(1 有用)',
  '上映日期': '2015/01/16',
  '制片国家': '日本',
  '条目链接': 'https://movie.douban.com/subject/25953663/'
}
  </pre>
</details>

<details>
  <summary>example of notion database properties</summary>
  <pre>
{
  '条目链接': {
    id: '=jBf',
      type: 'url',
        url: 'https://movie.douban.com/subject/26277363/'
  },
  'IMDb 链接': {
    id: '@ME}',
      type: 'url',
        url: 'https://www.imdb.com/title/tt5419278'
  },
  '主演': { id: 'X{lL', type: 'rich_text', rich_text: [[Object]] },
  '个人评分': {
    id: 'Z^ph',
    type: 'multi_select',
    multi_select: [ { id: 'FRXk', name: '5', color: 'pink' } ]
    // multi_select: [], // empty array if no value for rating
  },
  '打分日期': {
    id: 'e\\{[',
      type: 'date',
        date: { start: '2021-01-19', end: null }
  },
  '类型': {
    id: 'pzY>',
      type: 'multi_select',
        multi_select: [[Object], [Object]]
  },
  '海报': {
    id: 't@Fv',
    type: 'files',
    files: [
    {
      name: 'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2524998570.jpg'
    }
  ]
  },
  '我的短评': { id: 'wG?R', type: 'rich_text', rich_text: [[Object]] },
  '上映年份': { id: 'xghA', type: 'number', number: 2016 },
  '导演': { id: 'y]UL', type: 'rich_text', rich_text: [[Object]] },
  '标题': { id: 'title', type: 'title', title: [[Object]] }
}
  </pre>
</details>



## sync database from douban rss
通过上面的脚本可以一次性处理添加几十个条目，但终究需要手动隔一段时间去执行。
我想到的能够自动同步豆瓣标记的方法就是通过 RSS，所幸豆瓣的 RSS 功能一直健在。

以下是 RSS 数据解析之后的例子：

<details>
  <summary>douban rss parsed example</summary>
  <pre>
#竹子哟竹子#✨ 的收藏
{
  creator: '#竹子哟竹子#✨',
  title: '想看白蛇传·情',
  link: 'http://movie.douban.com/subject/34825976/',
  pubDate: 'Mon, 31 May 2021 15:14:58 GMT',
  'dc:creator': '#竹子哟竹子#✨',
  content:
    `<table><tr> <td width="80px"><a href="https://movie.douban.com/subject/34825976/" title="白蛇传·情"> <img src="https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2645106865.webp" alt="白蛇传·情"></a></td> <td> <p>推荐: 很差/较差/还行/推荐/力荐</p> </td></tr></table>`,
  contentSnippet: '',
  guid: 'https://www.douban.com/people/MoNoMilky/interests/2898270366',
  isoDate: '2021-05-31T15:14:58.000Z'
}
{
  creator: '#竹子哟竹子#✨',
  title: '想看大宋提刑官',
  link: 'http://movie.douban.com/subject/2239292/',
  pubDate: 'Mon, 31 May 2021 15:12:13 GMT',
  'dc:creator': '#竹子哟竹子#✨',
  content: '\n' +
    '\n' +
    '    <table><tr>\n' +
    '    <td width="80px"><a href="https://movie.douban.com/subject/2239292/" title="大宋提刑官">\n' +
    '    <img src="https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2397544089.jpg" alt="大宋提刑官"></a></td>\n' +
    '    <td>\n' +
    '<p>推荐: 还行</p><p>备注: 测试
    短评第 2 行</p>'
    '    </td></tr></table>\n',
  contentSnippet: '推荐: 还行\n备注: 测试\n短评第 2 行',
  guid: 'https://www.douban.com/people/MoNoMilky/interests/2898265663',
  isoDate: '2021-05-31T15:12:13.000Z'
}
  </pre>
</details>

RSS 的好处一个是轻量，但又包含了个人标记的最重要的几个数据：名字、条目链接、时间、评分、短评。
所以需求可以转换为，定时获取 RSS 更新，并对新的条目进行抓取信息并同步到 notion database。

由此完成了 `sync-rss.js` 脚本工具，即获取 RSS 数据，对新加入的条目进行抓取信息，处理后添加到对应的 notion database 中即可。

这个脚本只要能定时自己跑就可以自动从豆瓣标记去更新 notion 了！

需要一个能跑 cron job 的服务即可，贫穷又很懒的我在想过一圈之后，发现 GitHub Actions 可以跑 [scheduled workflow](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule), 完美满足需求。

经过一番查找文档，设定好了 [sync-rss workflow](./.github/workflows/sync-rss.js.yml)。此处我的 schedule 是 "Runs every 6 hours"，也就是一天也只运行 4 次。

但需要考虑的是，豆瓣的 RSS 数据每次都只保留 10 个，并且包括想看、想听、想读。本人仅处理看过、听过、读过的条目，所以如果某一天集中标记数量过多，可能使 RSS 数据并未全部被 workflow 获取。
也在考虑改成 每小时或者每两个小时跑一次。

另，GitHub 免费用户的开源仓库，actions 暂时是完全免费，也不计时间。

[查看 workflow 运行结果 ->](https://github.com/bambooom/douban-backup/actions/workflows/sync-rss.js.yml)

## sync to NeoDB

> [NeoDB 文档](https://neodb.social/developer/)

在文档页面先生成一个 Token，然后给 repo 添加一个 secret 叫 `NEODB_API_TOKEN`。
即可开启在豆瓣的标记会同步到 NeoDB 的功能。

## todo
- [x] ~~补全 notion 中的海报~~
  - 同步时会正常插入海报信息，海报图片是豆瓣上的图片的 URL，所以在 notion 中显示不稳定。但因为 notion API 不支持上传文件，所以也无法直接插入图片。暂时不做任何优化。
- [x] ~~userscript 添加导出 在* 和 想* 的功能~~
  - 想* 的部分已更新
  - 在* 的部分感觉个人需求实在不太大，已搁置
- [x] 豆瓣的标记同步更新到 NeoDB
- [ ] 添加 *在\** 或者 *想\** 列表，考虑一下如何显示？
- [ ] 从别处更新条目，比如 NeoDB，因为部分条目在豆瓣被删除或未创建
