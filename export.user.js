// ==UserScript==
// @name         豆瓣读书+电影+音乐+游戏导出工具
// @namespace    https://www.douban.com/people/MoNoMilky/
// @version      0.2
// @description  扩展修改自 https://openuserjs.org/scripts/KiseXu/%E8%B1%86%E7%93%A3%E7%94%B5%E5%BD%B1%E5%AF%BC%E5%87%BA%E5%B7%A5%E5%85%B7
// @author       Bambooom
// @match        https://book.douban.com/people/*/collect*
// @match        https://movie.douban.com/people/*/collect*
// @match        https://music.douban.com/people/*/collect*
// @match        https://www.douban.com/people/*
// @require      https://unpkg.com/dexie@latest/dist/dexie.js
// @grant        none
// ==/UserScript==


(function () {
  'use strict';
  var MOVIE = 'movie', BOOK = 'book', MUSIC = 'music', GAME = 'game', people;
  /* global $, Dexie */

  function getExportLink(type, people) { // type=book/movie/music
    return 'https://' + type + '.douban.com/people/' + people + '/collect?start=0&sort=time&rating=all&filter=all&mode=list&export=1';
  }

  function getGameExportLink(people) { // type=game
    return 'https://www.douban.com/people/' + people + '/games?action=collect&start=0&export=1';
  }

  if (location.href.indexOf('//www.douban.com/people/') > -1) {
    // 加入导出按钮
    var match = location.href.match(/www\.douban\.com\/people\/(.+)\//);
    people = match ? match[1] : null;
    $('#book h2 .pl a:last').after('&nbsp;·&nbsp;<a href="' + getExportLink(BOOK, people) + '">导出读过的书</a>');
    $('#movie h2 .pl a:last').after('&nbsp;·&nbsp;<a href="' + getExportLink(MOVIE, people) + '">导出看过的片</a>');
    $('#music h2 .pl a:last').after('&nbsp;·&nbsp;<a href="' + getExportLink(MUSIC, people) + '">导出听过的碟</a>');
    $('#game h2 .pl a:last').after('&nbsp;·&nbsp;<a href="' + getGameExportLink(people) + '">导出玩过的游戏</a>');
  }

  if (location.href.indexOf('//book.douban.com/') > -1 && location.href.indexOf('export=1') > -1) {
    init(BOOK);
  }

  if (location.href.indexOf('//movie.douban.com/') > -1 && location.href.indexOf('export=1') > -1) {
    init(MOVIE);
  }

  if (location.href.indexOf('//music.douban.com/') > -1 && location.href.indexOf('export=1') > -1) {
    init(MUSIC);
  }

  if (people && location.href.indexOf('//www.douban.com/people/' + people + '/games') > -1 && location.href.indexOf('export=1') > -1) {
    init(GAME);
  }

  function escapeQuote(str) {
    return str.replaceAll('"', '""'); // " need to be replaced with two quotes to escape inside csv quoted string
  }

  // 获取当前页数据
  function getCurPageItems(type) {
    var items = [];

    var elems = $('li.item');

    if (type === GAME) {
      elems = $('.game-list .common-item');
    }

    elems.each(function(index) {
      var item = {
        title: escapeQuote($(this).find('.title a').text().trim()),
        link: $(this).find('.title a').attr('href').trim(),
        'rating_date': $(this).find('.date').text().trim().replaceAll('-', '/'), // 2020-07-17 => 2020/07/17
      };
      if (type === GAME) {
        let rating = $(this).find('.rating-info .rating-star').attr('class');
        rating = rating
          ? (rating.slice(19, 20) === 'N' ? '' : Number(rating.slice(19, 20)))
          : '';
        item.rating = rating;
      } else {
        item.rating = ($(this).find('.date span').attr('class')) ? $(this).find('.date span').attr('class').slice(6, 7) : '';
      }

      var co = $(this).find('.comment');
      if (co.length) {
        co = co[0];
        if (type === MOVIE) {
          // 电影条目在 collect 页面显示了有用数，eg “（1有用）”，所以需要单独提取 childNode 进行 trim，否则结果的 csv 里包含大量多余空格空行，很容易处理错误
          item.comment = co.firstChild.textContent.trim() + (co.firstElementChild ? co.firstElementChild.textContent.trim() : '');
        } else { // 图书及音乐条目没有显示 有用数
          item.comment = co.textContent.trim();
        }
        item.comment = escapeQuote(item.comment);
      } else if (type === GAME) {
        co = $(this).find('.user-operation');
        if (co.length) {
          co = co[0];
          item.comment = co.previousElementSibling.textContent.trim();
          item.comment = escapeQuote(item.comment);
        }
      }

      if (type === GAME) {
        var extra = $(this).find('.desc')[0].firstChild.textContent.trim();
        item.release_date = extra.split(' / ').slice(-1)[0];
        items[index] = item;
        return; // for type=game, here is over
      }

      var intro = $(this).find('.intro').text().split(' / ');
      if (intro.length) {
        if (type === MOVIE) {
          intro = intro[0];
          var res = intro.match(/^(\d{4}-\d{2}-\d{2})\((.*)\)$/);
          if (res) {
            item.release_date = res[1].replaceAll('-', '/');
            item.country = res[2];
          }
        } else {
          // 不一定有准确日期，可能是 2009-5 这样的, 也可能就只有年份 2000
          var dateReg = /\d{4}(?:-\d{1,2})?(?:-\d{1,2})?/;
          if (!dateReg.test(intro[0])) { // intro 首项非日期，则一般为作者或音乐家
            if (type === BOOK) {
              item.author = escapeQuote(intro[0]);
            } else if (type === MUSIC) {
              item.musician = escapeQuote(intro[0]);
            }
          }
          var d = intro.filter(function(txt) {return dateReg.test(txt);});
          if (d.length) {
            item.release_date = d[0].replaceAll('-', '/');
          }
        }
      }

      items[index] = item;
    });

    return items;
  }

  function init(type) {
    const db = new Dexie('db_export'); // init indexedDB
    if (type === MOVIE) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, country, link',
      });
    } else if (type === BOOK) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, author, link',
      });
    } else if (type === MUSIC) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, musician, link',
      });
    } else if (type === GAME) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, link',
      });
    }

    const items = getCurPageItems(type);
    db.items.bulkAdd(items).then(function() {
      console.log('添加成功+', items.length);

      let nextPageLink = $('.paginator span.next a').attr('href');
      if (nextPageLink) {
        nextPageLink = nextPageLink + '&export=1';
        window.location.href = nextPageLink;
      } else {
        exportAll(type);
      }
    }).catch(function (error) {
      console.error("Ooops: " + error);
    });
  }

  function exportAll(type) {
    const db = new Dexie('db_export');
    if (type === MOVIE) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, country, link',
      });
    } else if (type === BOOK) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, author, link',
      });
    } else if (type === MUSIC) {
      db.version(1).stores({
        items: `++id, title, rating, rating_date, comment, release_date, musician, link`,
      });
    } else if (type === GAME) {
      db.version(1).stores({
        items: '++id, title, rating, rating_date, comment, release_date, link',
      });
    }

    db.items.orderBy('rating_date').reverse().toArray().then(function(all) {
      all = all.map(function(item) {
        delete item.id;
        return item;
      });

      let title = ['标题', '个人评分', '打分日期', '我的短评'];
      let key = ['title', 'rating', 'rating_date', 'comment', 'release_date'];
      if (type === MOVIE) {
        title = title.concat(['上映日期', '制片国家', '条目链接']);
        key = key.concat(['country', 'link']);
      } else if (type === BOOK) {
        title = title.concat(['出版日期', '作者', '条目链接']);
        key = key.concat(['author', 'link']);
      } else if (type === MUSIC) {
        title = title.concat(['发行日期', '音乐家', '条目链接']);
        key = key.concat(['musician', 'link']);
      } else if (type === GAME) {
        title = title.concat(['发行日期', '条目链接']);
        key.push('link');
      }

      JSonToCSV.setDataConver({
        data: all,
        fileName: 'db-' + type + '-' + new Date().toISOString().split('T')[0].replaceAll('-', ''),
        columns: {title, key},
      });
      db.delete();
    });
  }

  // 导出CSV函数
  // https://github.com/liqingzheng/pc/blob/master/JsonExportToCSV.js
  var JSonToCSV = {
    /*
     * obj是一个对象，其中包含有：
     * ## data 是导出的具体数据
     * ## fileName 是导出时保存的文件名称 是string格式
     * ## showLabel 表示是否显示表头 默认显示 是布尔格式
     * ## columns 是表头对象，且title和key必须一一对应，包含有
          title:[], // 表头展示的文字
          key:[], // 获取数据的Key
          formatter: function() // 自定义设置当前数据的 传入(key, value)
     */
    setDataConver: function (obj) {
      var bw = this.browser();
      if (bw['ie'] < 9) return; // IE9以下的
      var data = obj['data'],
        ShowLabel = typeof obj['showLabel'] === 'undefined' ? true : obj['showLabel'],
        fileName = (obj['fileName'] || 'UserExport') + '.csv',
        columns = obj['columns'] || {
          title: [],
          key: [],
          formatter: undefined
        };
      ShowLabel = typeof ShowLabel === 'undefined' ? true : ShowLabel;
      var row = "",
        CSV = '',
        key;
      // 如果要现实表头文字
      if (ShowLabel) {
        // 如果有传入自定义的表头文字
        if (columns.title.length) {
          columns.title.map(function (n) {
            row += n + ',';
          });
        } else {
          // 如果没有，就直接取数据第一条的对象的属性
          for (key in data[0]) row += key + ',';
        }
        row = row.slice(0, -1); // 删除最后一个,号，即a,b, => a,b
        CSV += row + '\r\n'; // 添加换行符号
      }
      // 具体的数据处理
      data.map(function (n) {
        row = '';
        // 如果存在自定义key值
        if (columns.key.length) {
          columns.key.map(function (m) {
            row += '"' + (typeof columns.formatter === 'function' ? columns.formatter(m, n[m]) || n[m] || '' : n[m] || '') + '",';
          });
        } else {
          for (key in n) {
            row += '"' + (typeof columns.formatter === 'function' ? columns.formatter(key, n[key]) || n[key] || '' : n[key] || '') + '",';
          }
        }
        row.slice(0, row.length - 1); // 删除最后一个,
        CSV += row + '\r\n'; // 添加换行符号
      });
      if (!CSV) return;
      this.SaveAs(fileName, CSV);
    },
    SaveAs: function (fileName, csvData) {
      var bw = this.browser();
      if (!bw['edge'] || !bw['ie']) {
        var alink = document.createElement("a");
        alink.id = "linkDwnldLink";
        alink.href = this.getDownloadUrl(csvData);
        document.body.appendChild(alink);
        var linkDom = document.getElementById('linkDwnldLink');
        linkDom.setAttribute('download', fileName);
        linkDom.click();
        document.body.removeChild(linkDom);
      } else if (bw['ie'] >= 10 || bw['edge'] == 'edge') {
        var _utf = "\uFEFF";
        var _csvData = new Blob([_utf + csvData], {
          type: 'text/csv'
        });
        navigator.msSaveBlob(_csvData, fileName);
      } else {
        var oWin = window.top.open("about:blank", "_blank");
        oWin.document.write('sep=,\r\n' + csvData);
        oWin.document.close();
        oWin.document.execCommand('SaveAs', true, fileName);
        oWin.close();
      }
    },
    getDownloadUrl: function (csvData) {
      var _utf = "\uFEFF"; // 为了使Excel以utf-8的编码模式，同时也是解决中文乱码的问题
      if (window.Blob && window.URL && window.URL.createObjectURL) {
        csvData = new Blob([_utf + csvData], {
          type: 'text/csv'
        });
        return URL.createObjectURL(csvData);
      }
      // return 'data:attachment/csv;charset=utf-8,' + _utf + encodeURIComponent(csvData);
    },
    browser: function () {
      var Sys = {};
      var ua = navigator.userAgent.toLowerCase();
      var s;
      (s = ua.indexOf('edge') !== -1 ? Sys.edge = 'edge' : ua.match(/rv:([\d.]+)\) like gecko/)) ? Sys.ie = s[1]:
        (s = ua.match(/msie ([\d.]+)/)) ? Sys.ie = s[1] :
        (s = ua.match(/firefox\/([\d.]+)/)) ? Sys.firefox = s[1] :
        (s = ua.match(/chrome\/([\d.]+)/)) ? Sys.chrome = s[1] :
        (s = ua.match(/opera.([\d.]+)/)) ? Sys.opera = s[1] :
        (s = ua.match(/version\/([\d.]+).*safari/)) ? Sys.safari = s[1] : 0;
      return Sys;
    }
  };

})();
