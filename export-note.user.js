// ==UserScript==
// @name             豆瓣日记导出工具
// @namespace        https://www.douban.com/people/MoNoMilky/
// @version          0.1
// @description      将豆瓣日记导出为 markdown
// @author           Bambooom
// @icon             https://www.google.com/s2/favicons?domain=douban.com
// @match            https://www.douban.com/people/*/notes*
// @require          https://unpkg.com/dexie@latest/dist/dexie.js
// @require          https://unpkg.com/turndown/dist/turndown.js
// @grant            none
// ==/UserScript==

(function () {
  'use strict';

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

  function escapeQuote(str) {
    return str.replaceAll('"', '""'); // " need to be replaced with two quotes to escape inside csv quoted string
  }

  // @todo: use button to activate, and also save to dexie and export all md files
  //$('#content .aside .create-note a:last').after('&nbsp; &nbsp;<a href="?start=0&type=note&export=1" onclick="">导出日记</a>');

  var notes = $('.note-container[id^="note-"]');
  notes.each(function (index) {
    var note = $(this);
    var title = escapeQuote(note.find('.note-header-container a').text().trim());
    console.log(title);
    var toggle = note.find('.note-header-container .rr a:first'); // 展开全文
    // toggle.click();

    // @fixme: test for only one note is enough
    if (index === 0) {
      toggle.click();

      setTimeout(() => {
        let dom = note.find('[id^="note_"][id$="_full"] .note')[0];
        let md = tdService.turndown(dom);
        console.log(md);
      }, 1500);
    }

    // setTimeout(function() {
    //   let dom = note.find('[id^="note_"][id$="_full"] .note')[0];
    //   let md = tdService.turndown(dom);
    //   // @todo: add rule to turndown, more specify for douban note style

    //   // console.log(md);
    // }, 1500);
  });


})();
