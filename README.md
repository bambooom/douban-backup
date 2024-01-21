![sync-rss](https://github.com/bambooom/douban-backup/actions/workflows/sync-rss.js.yml/badge.svg)

> 详细教程 -> https://zhuzi.dev/posts/2021-06-05-douban-backup-sync-notion/
>
> 油猴脚本 -> https://greasyfork.org/en/scripts/420999


```
.
├── archive     # 不再使用的实验时的爬虫脚本
├── cols.json   # 可修改自定义的 Notion 表格列名
├── .env        # 如果需要在本地 debug，可以添加这个文件
├── scripts     # 长期不需要使用的脚本，但未来有可能需要使用
├── src         # 会保持更新正在使用的脚本👩🏻‍💻👈
└── userscript  # 导出时可使用的油猴脚本
```


## 从豆瓣 RSS 数据同步到 Notion 数据库

<details>
  <summary>使用油猴脚本 <code>export.user.js</code>导出的 CSV 数据样例（one row）</summary>
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
  <summary>Notion 数据库 properties 样例数据</summary>
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

<details>
  <summary>豆瓣RSS 数据解析之后的例子</summary>
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

---

RSS 的好处一个是轻量，但又包含了个人标记的最重要的几个数据：名字、条目链接、时间、评分、短评。
所以需求可以转换为，定时获取 RSS 更新，并对新的条目进行抓取信息并同步到 notion database。

但需要注意的是，豆瓣的 RSS 数据每次都只保留 10 个，并且包括想看、想听、想读。本人的脚本同步到 Notion 的部分仅处理看过、听过、读过的条目，如果某一天集中标记数量过多，可能使 RSS 数据并未全部被 workflow 获取。
这种情况的时候请自己手动触发脚本的运行，或者将脚本运行间隔时间改短，比如每个小时或者每两个小时。

GitHub 免费用户的开源仓库，actions 暂时是完全免费，也不计时间。

[查看 workflow 运行结果 ->](https://github.com/bambooom/douban-backup/actions/workflows/sync-rss.js.yml)

## 同时同步标记到 NeoDB

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
