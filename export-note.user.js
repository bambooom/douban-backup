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
  });

  // highlight-block => ref block `>`
  tdService.addRule('highlight-block', {
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

  // @todo: span font-weight: bold => **bold**
  // @todo: keep <mark>

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
