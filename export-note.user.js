// ==UserScript==
// @name             豆瓣日记导出工具
// @namespace        https://www.douban.com/people/MoNoMilky/
// @version          0.2.1
// @description      将豆瓣日记导出为 markdown
// @author           Bambooom
// @icon             https://www.google.com/s2/favicons?domain=douban.com
// @match            https://www.douban.com/people/*/notes*
// @match            https://www.douban.com/people/*
// @require          https://unpkg.com/dexie@latest/dist/dexie.js
// @require          https://unpkg.com/turndown/dist/turndown.js
// @require          https://unpkg.com/jszip@3.2.0/dist/jszip.min.js
// @require          https://unpkg.com/file-saver@2.0.0-rc.2/dist/FileSaver.min.js
// @grant            none
// ==/UserScript==

(function () {
  'use strict';
  /* global $, Dexie, TurndownService, JSZip, saveAs */

  var tdService = new TurndownService({
    headingStyle: 'atx', // use # for header
    hr: '---',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // <mark>, keep this html since no corresponding format in markdown
  tdService.keep(['mark']);

  // span font-weight:bold => **content**
  tdService.addRule('bold', {
    filter: function(node) {
      return (
        node.nodeName === 'SPAN' &&
        node.style[0] &&
        node.style[0] === 'font-weight' &&
        node.style.fontWeight === 'bold'
      );
    },
    replacement: function (content) {
      return '**' + content + '** '; // add one more space in the end as in Chinese if no space, the markdown syntax is not rendered correctly
    },
  });

  // span text-decoration:line-through => ~~content~~
  tdService.addRule('line-through', {
    filter: function(node) {
      return (
        node.nodeName === 'SPAN' &&
        node.style[0] &&
        node.style[0].startsWith('text-decoration') &&
        node.style.textDecoration === 'line-through'
      );
    },
    replacement: function (content) {
      return '~~' + content + '~~ '; // add one more space in the end
    },
  });

  // highlight-block 文本区块 => ref block `>`
  tdService.addRule('hilite- block', {
    filter: function(node) {
      return (
        node.nodeName === 'DIV' &&
        node.className === 'highlight-block'
      );
    },
    replacement: function (content) {
      return '> ' + content;
    },
  });

  // introduction 导语 => ref block `>`
  tdService.addRule('introduction', {
    filter: function(node) {
      return (
        node.nodeName === 'DIV' &&
        node.className === 'introduction'
      );
    },
    replacement: function (_, node) {
      return '> ' + node.textContent + '\n\n';
    },
  });

  // handle video => make it to link format
  tdService.addRule('video', {
    filter: function(node) {
      return (
        node.nodeName === 'DIV' &&
        node.className === 'video-player-iframe'
      );
    },
    replacement: function(_, node) {
      var link = node.children[0].getAttribute('src'); // first child is iframe, src it the the video link
      var title = node.children[1].textContent.trim(); // second child is video-title
      return '[' + title + '](' + link + ')';
    },
  });

  // movie/music/book/... item card => link format now
  tdService.addRule('subject', {
    filter: function(node) {
      return (
        node.nodeName === 'DIV' &&
        node.className === 'subject-wrapper'
      );
    },
    replacement: function(_, node) {
      var link = node.children[0].getAttribute('href'); // item link
      var title = node.querySelector('.subject-title').textContent.trim(); // item title
      return '[' + title + '](' + link + ')';
    },
  });

  // item caption => ref
  tdService.addRule('subject-caption', {
    filter: function(node) {
      return (
        node.nodeName === 'DIV' &&
        node.className === 'subject-caption'
      );
    },
    replacement: function(content) {
      return '> ' + content;
    },
  });

  var people;

  if (location.href.indexOf('//www.douban.com/people/') > -1) {
    // 加入导出按钮
    let match = location.href.match(/www\.douban\.com\/people\/([^/]+)\//);
    people = match ? match[1] : null;
    $('#note h2 .pl a:last').after('&nbsp;·&nbsp;<a href="https://www.douban.com/people/' + people + '/notes?start=0&type=note&export=1">导出</a>');
  }

  if (people && location.href.indexOf('//www.douban.com/people/' + people + '/notes') > -1 && location.href.indexOf('export=1') > -1) {
    init();
  }

  function escapeQuote(str) {
    return str.replaceAll('"', '""'); // " need to be replaced with two quotes to escape inside csv quoted string
  }

  async function init() {
    const db = new Dexie('db_notes_export'); // init indexedDB
    db.version(1).stores({
      notes: '++id, title, datetime, linkid, md',
    });

    const notes = await getCurPageNotes();
    db.notes.bulkAdd(notes).then(function () {
      console.log('添加成功+', notes.length);

      let nextPageLink = $('.paginator span.next a').attr('href');
      if (nextPageLink) {
        nextPageLink = nextPageLink + '&export=1';
        window.location.href = nextPageLink;
      } else {
        exportAll();
      }
    }).catch(function (error) {
      console.error("Ooops: " + error);
    });
  }

  // https://gist.github.com/jwilson8767/db379026efcbd932f64382db4b02853e
  function noteReady(noteId) {
    const selector = '#note_' + noteId + '_full .note';
    return new Promise((resolve, reject) => {
      let el = document.querySelector(selector);
      if (el) { resolve(el); }

      new MutationObserver((_, observer) => {
        // Query for elements matching the specified selector
        Array.from(document.querySelectorAll(selector)).forEach((element) => {
          resolve(element);
          //Once we have resolved we don't need the observer anymore.
          observer.disconnect();
        });
      })
        .observe(document.documentElement, {
          childList: true,
          subtree: true
        });
    });
  }

  async function getCurPageNotes() {
    var notes = [];
    var elems = $('.note-container[id^="note-"]').get();

    // 展开全文
    var toggles = document.querySelectorAll('.note-header-container .rr a.a_unfolder_n');
    Array.from(toggles).forEach(toggle => {
      toggle.click();
    });

    for (let i = 0; i < elems.length; i++) {
      var note = elems[i];
      var id = note.id.match(/note-(\d+)$/);
      id = id[1];
      var title = escapeQuote(note.querySelector('.note-header-container h3 > a').textContent.trim());
      var datetime = note.querySelector('.note-header-container .pub-date').textContent;

      await noteReady(id);
      var notedom = note.querySelector('#note_' + id + '_full .note');
      var md = tdService.turndown(notedom);
      notes.push({
        title,
        datetime, // like '2021-07-10 00:29:36'
        linkid: id,
        md,
      });
    }

    return notes;
  }

  function exportAll() {
    const db = new Dexie('db_notes_export');
    db.version(1).stores({
      notes: '++id, title, datetime, linkid, md',
    });

    var zip = new JSZip();

    db.notes.toArray().then(function (all) {
      all.map(function(item) {
        delete item.id;
        var date = item.datetime.split(' ')[0];
        var frontmatter = '---\n'
          + 'layout: post\n'
          + 'title: ' + item.title + '\n'
          + 'date: ' + date + '\n' // keep date only
          + 'disqus: y\n---\n\n'
          + 'original link: https://www.douban.com/note/' + item.linkid + '/\n\n';
        zip.file(date + '-' + item.title + '.md', frontmatter + item.md);
      });

      zip.generateAsync({type:"blob"}).then(function(content) {
        saveAs(content, 'douban-notes-' + new Date().toISOString().split('T')[0].replaceAll('-', '') + '.zip');
      });

      db.delete();
    });
  }

})();
