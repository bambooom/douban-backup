## Puppeteer crawler

这个文件夹里是之前尝试用 puppeteer 去爬取豆瓣电影条目页面的数据的一些脚本。
主要流程如下：

1. 首先使用油猴脚本 [`export.user.js`](../export.user.js) 从豆瓣上导出自己标记的电影条目数据，得到的是一个 csv 文件。数据格式大致如下：

```csv
title,rate,rate_date,link,comment
"一树梨花压海棠 / Lolita","3","2008-03-12","https://movie.douban.com/subject/1296778/","",
"原罪 / Original Sin","3","2008-03-12","https://movie.douban.com/subject/1302303/","",
"雨中曲 / Singin' in the Rain","4","2008-03-12","https://movie.douban.com/subject/1293460/","",
...
"将恋爱进行到底 / 恋はつづくよどこまでも","","2020-10-18","https://movie.douban.com/subject/34805659/","需要胰岛素般的甜，砂糖太帅惹惹惹惹惹wwwww",
```

这个数据是只有很简单的名字和链接，对其他的比如导演演员、上映时间、IMDb 信息等都缺失。

2. 将此 csv 文件作为 input 运行 `crawler.js` 对每一行的条目信息进行获取。使用 puppeteer 去访问页面，但是很容易触发反爬虫机制，ip 就会被 block。此时个人手动网页里登录豆瓣都会有问题。
此脚本会在爬取条目信息的时候同步更新本地的一个 json 文件。大致例子如下：

```json
{
  count: 2901,
  values: [
    {
      "title": "一树梨花压海棠 / Lolita",
      "rate": "3",
      "rate_date": "2008-03-12",
      "link": "https://movie.douban.com/subject/1296778/",
      "comment": "",
      "year": "1997",
      "director": "阿德里安·莱恩",
      "img": "https://img1.doubanio.com/view/photo/s_ratio_poster/public/p571119308.webp",
      "actors": "杰瑞米·艾恩斯 / 梅兰尼·格里菲斯 / 弗兰克·兰格拉 / 多米尼克·斯万 / 苏珊妮·谢泼德 / 基思·雷丁 / 埃琳·J·迪安 / 琼·格洛弗 / 帕特·珀金斯 / 埃德·格雷迪 / 安吉拉·佩顿 / 本·西尔弗斯通 / 爱玛·格里菲斯·马琳 / 罗纳德·皮卡普 / 迈克尔·卡尔金 / 安娜贝勒.艾裴逊 / 迈克尔·多兰 / 哈莉·赫里什 / 约翰·福兰克林·罗宾斯 / 缪斯·沃森",
      "genre": "剧情 / 爱情 / 情色",
      "imdb": "https://www.imdb.com/title/tt0119558",
      "checked": 1
    },
    {
      "title": "原罪 / Original Sin",
      "rate": "3",
      "rate_date": "2008-03-12",
      "link": "https://movie.douban.com/subject/1302303/",
      "comment": "",
      "year": "2001",
      "director": "迈克尔·克里斯托弗",
      "img": "https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2563026581.webp",
      "actors": "安东尼奥·班德拉斯 / 安吉丽娜·朱莉 / 托马斯·简 / 杰克·汤普森 / Allison Mackie / 乔安·普林格尔 / 詹姆斯·哈文 / Lisa Owen / 格里高利·伊齐恩",
      "genre": "剧情 / 爱情 / 悬疑 / 情色",
      "imdb": "https://www.imdb.com/title/tt0218922",
      "checked": 1
    },
    ...
  ],
}
```

3. 在想尽各种办法避免 ip 被禁并更新完所有条目信息后，使用 `json2csv.js` 工具将前面的 json 文件再一次转化为 csv 文件。

4. 打开 notion，创建一个新的 database 表格（保证 header 和 csv 的 header 名字顺序一致），选择 `Merge with csv` 稍等两分钟，即可完成全部导出过程。
