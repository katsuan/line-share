// 目じるしと進みぐあい（Q ツール共通。window.QMilestones）。これまでの合計を、よく知られた物（ゾウ・東京タワー・地球…）や
// 区切り（7日・30日・1年…）とくらべて、「🐘 ゾウまで ▓▓░░ あと 1,200 kg」「いま 3.2 頭分」のように見せる。キロっくの「これまでに持ち上げた重さ」から作った。
//
// 使い方：自分の script より前に
//   <script src="https://katsuan.github.io/oqrn/shared/milestones.js" defer></script> → window.QMilestones
//   見た目は ui.css（.ls-goal・.ls-ms）。読めなかったとき（電波がないなど）に備えて、ツールは window.QMilestones がなくても動くようにしておく
//
//   const m = QMilestones.create({
//     marks: [{ icon: "🐘", name: "ゾウ", short: "ゾウ", value: 6000, count: "頭", big: false }, ...],  // 小さい順。単位はツールが決める（kg・日・回・県…）
//     amount: (v) => v + " kg",        // 合計・「あと ◯」の書き方（省くと「1.23万」のように数だけ）
//     markValue: (v) => "約 " + v + " kg"  // 目じるしの値の書き方（省くと amount と同じ）
//   });
//   m.progress(total)              … { passed, next, passedCount, toNext, progress（前の目じるしから次まで 0〜1） }
//   m.goalHtml(total, { lead })    … 送る帯の上などに置く「🐘 ゾウまで ▓▓░░ あと 1,200 kg」（lead は上に添える1行。「今日 …」など）
//   m.tableHtml(total, { title, hint })  … 目じるしの表（越えたら ✅・次だけ「あと ◯」・小さいものはかくして big は見せる・押すと「いま ◯ 頭分」）
//   m.compareLabel(v)              … 「🐘 ゾウ 0.9 頭分」（1つ分にいちばん近い目じるしでくらべる）
//   m.newlyPassed(before, after)   … 新しく越えた目じるし（越えたときの見出しに。m.passedTitle(mark) で「🎉 🐘 ゾウを越えました！」）
//   いちばん上の目じるしを越えたら「地球 2個分」「3個分」…と続く
//
// これまでの合計（記録を消しても減らない・同じ記録は2回数えない・同じ記録が書きかわったら差の分だけ直す）：
//   QMilestones.syncLedger(ledger, [{ id, value }, ...]) → { ledger, added }。ledger は { total, counted: [[id, 数えた値], ...] }（端末に残す形）
//   QMilestones.loadLedger(key) / saveLedger(key, ledger)（localStorage。読めない・残せない端末でも止めない）
// 大きな数：QMilestones.bigNumber(2.75e10) → "275億"（万・億・兆・京・垓）
var QMilestones = (function () {
  "use strict";

  var COUNTED_MAX = 300;
  var UNITS = [[1e20, "垓"], [1e16, "京"], [1e12, "兆"], [1e8, "億"], [1e4, "万"]];

  // 0.1 にそろえる（足し引きで出る小さなずれを残さない）
  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  // HTML に入れる文字
  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- 大きな数 ----

  // 大きな数を 万・億・兆・京・垓 で（3けたくらいにまるめる）：12345 → "1.23万"、2.75e10 → "275億"、6e21 → "60垓"。1万より小さいときは「3,000」「1.5」
  function bigNumber(value) {
    var v = Math.max(0, Number(value) || 0);
    var unit = UNITS.find(function (u) { return v >= u[0]; });
    if (!unit) return (Math.round(v * 10) / 10).toLocaleString("ja-JP");
    var n = v / unit[0];
    var digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
    return (Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)).toLocaleString("ja-JP") + unit[1];
  }

  // 「0.9」「3.6」「12」「1.2万」（◯つ分の数。10 からは整数、1万からは 万・億…）
  function ratioLabel(ratio) {
    return ratio >= 10000 ? bigNumber(ratio) : ratio >= 10 ? String(Math.round(ratio)) : String(Math.round(ratio * 10) / 10);
  }

  // 遠い目じるしにくらべて、いまどれくらいか：「1.2％」「0.0035％」、もっと小さければ「1兆分の1」。0・目じるしを越えていれば ""
  function shareLabel(value, markValue) {
    var v = Number(value) || 0;
    if (v <= 0 || v >= markValue) return "";
    var percent = (v / markValue) * 100;
    if (percent >= 0.001) return String(Number(percent.toPrecision(2))) + "％";
    return bigNumber(Number((markValue / v).toPrecision(2))) + "分の1";
  }

  // ---- これまでの合計（消しても減らない） ----

  // 端末から読んだ中身を、合計の形にして返す（読めないものは null。はじめて開いたときも null）
  function ledgerIn(value, max) {
    if (!value || typeof value !== "object" || !Array.isArray(value.counted)) return null;
    var total = Number(value.total);
    if (!Number.isFinite(total) || total < 0) return null;
    var counted = value.counted
      .filter(function (row) { return Array.isArray(row) && typeof row[0] === "string" && row[0] && Number.isFinite(Number(row[1])); })
      .filter(function (row, i, rows) { return rows.findIndex(function (r) { return r[0] === row[0]; }) === i; }) // 同じ id は前のもの1つ
      .map(function (row) { return [row[0], Number(row[1])]; })
      .slice(0, max || COUNTED_MAX);
    return { total: round1(total), counted: counted };
  }

  /**
   * 記録（[{ id, value }]）のうち、まだ数えていないものを合計に足す。同じ id で値が変わった記録（直した記録）は差の分だけ直す。
   * 一覧にない記録（消した・古くて消えた）は、合計から引かない。ledger が null（はじめて）なら、今ある記録を1回だけ数える。
   * { ledger: 新しい合計, added: 増えた分（直して減ったときはマイナス） } を返す。opts.max は覚える id の数（新しいものから。はじめは 300）
   */
  function syncLedger(ledger, items, opts) {
    var max = (opts && opts.max) || COUNTED_MAX;
    var base = ledgerIn(ledger, max) || { total: 0, counted: [] };
    var known = new Map(base.counted);
    var added = 0;
    var fresh = [];
    (items || []).forEach(function (item) {
      if (!item || typeof item.id !== "string" || !item.id) return;
      var v = round1(Math.max(0, Number(item.value) || 0));
      if (known.has(item.id)) {
        var diff = v - known.get(item.id);
        if (diff !== 0) {
          added += diff;
          known.set(item.id, v);
        }
        return;
      }
      known.set(item.id, v);
      fresh.push([item.id, v]);
      added += v;
    });
    var rest = base.counted.map(function (row) { return [row[0], known.get(row[0])]; });
    return { ledger: { total: round1(Math.max(0, base.total + added)), counted: fresh.concat(rest).slice(0, max) }, added: round1(added) };
  }

  // 使う保存場所（テストでは storage を渡す）
  function store(storage) {
    if (storage) return storage;
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  // 合計を読む。ない・読めないときは null
  function loadLedger(key, storage) {
    try {
      return JSON.parse(store(storage).getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  // 合計を残す（残せない端末でも止めない）。残した中身を返す
  function saveLedger(key, ledger, storage) {
    try {
      store(storage).setItem(key, JSON.stringify(ledger));
    } catch (e) {
      // 残せなくても、開いているあいだは使える
    }
    return ledger;
  }

  // ---- 目じるし ----

  /**
   * 目じるしの組を作る。opts.marks（小さい順。{ icon, name, short?, value, count, big? }）・opts.amount（合計の書き方）・opts.markValue（目じるしの値の書き方）
   */
  function create(opts) {
    var marks = (opts && opts.marks) || [];
    var top = marks[marks.length - 1];
    var amount = (opts && opts.amount) || bigNumber;
    var markValue = (opts && opts.markValue) || amount;

    // total までの目じるし（いちばん上を越えていたら「地球 2個分」…を、次の1つまで足す）
    function marksFor(total) {
      var list = marks.slice();
      var laps = Math.floor(Math.max(0, Number(total) || 0) / top.value);
      for (var n = 2; n <= laps + 1; n += 1) {
        list.push(Object.assign({}, top, { name: top.name + " " + n + top.count + "分", short: top.name + " " + n + top.count + "分", value: top.value * n }));
      }
      return list;
    }

    // 合計がどこまで来たか
    function progress(total) {
      var v = Math.max(0, Number(total) || 0);
      var list = marksFor(v);
      var nextIndex = list.findIndex(function (mark) { return mark.value > v; });
      var next = list[nextIndex];
      var passed = nextIndex > 0 ? list[nextIndex - 1] : null;
      var from = passed ? passed.value : 0;
      return {
        passed: passed,
        next: next,
        passedCount: nextIndex,
        toNext: Math.max(0, Math.ceil((next.value - v) * 10) / 10),
        progress: Math.min(1, Math.max(0, (v - from) / (next.value - from)))
      };
    }

    // 合計が before から after に増えたとき、新しく越えた目じるし（いちばん大きいもの）。越えていなければ null
    function newlyPassed(before, after) {
      var a = progress(before).passed;
      var b = progress(after).passed;
      return b && (!a || b.value > a.value) ? b : null;
    }

    // 次の目じるしより先の並び：big はそのまま、そのあいだの小さい目じるしは「かくした数」にまとめる（[{ mark }, { locked: 3 }, ...]）
    function ahead(total) {
      var next = progress(total).next;
      var rows = [];
      marks.filter(function (m) { return m.value > next.value; }).forEach(function (mark) {
        if (mark.big) rows.push({ mark: mark });
        else if (rows.length && rows[rows.length - 1].locked) rows[rows.length - 1].locked += 1;
        else rows.push({ locked: 1 });
      });
      return rows;
    }

    // 1回の分（今日の分）を、1つ分にいちばん近い目じるしでくらべる：{ mark, ratio }。0 なら null
    function compare(value) {
      var w = Number(value) || 0;
      if (w <= 0) return null;
      var above = marks.find(function (m) { return m.value >= w; });
      var below = marks.slice().reverse().find(function (m) { return m.value < w; });
      var pick = !above ? below : !below ? above : w / below.value <= above.value / w ? below : above;
      return { mark: pick, ratio: w / pick.value };
    }

    // 「🐘 ゾウ 0.9 頭分」（0 なら ""）
    function compareLabel(value) {
      var c = compare(value);
      return c ? c.mark.icon + " " + c.mark.name + " " + ratioLabel(c.ratio) + " " + c.mark.count + "分" : "";
    }

    // いまの合計を1つの目じるしとくらべた言い方（表の目じるしを押したとき）：「いま 3.2 頭分」「いま 79％」「いま 1億分の1」「まだ 0 kg」
    function standing(total, mark) {
      var v = Math.max(0, Number(total) || 0);
      if (v <= 0) return "まだ " + amount(0);
      if (v >= mark.value) return "いま " + ratioLabel(v / mark.value) + " " + mark.count + "分";
      return "いま " + shareLabel(v, mark.value);
    }

    // 次の目じるしまで：近ければ「あと 1,200 kg」、とほうもなく遠ければ「いま 月の 1億分の1」。short なら目じるしの名前を入れない
    function rest(total, p, short) {
      var share = total > 0 && total < p.next.value / 100 ? shareLabel(total, p.next.value) : "";
      if (!share) return "あと " + amount(p.toNext);
      return "いま " + (short ? "" : (p.next.short || p.next.name) + "の ") + share;
    }

    // 越えたときの見出し：「🎉 🐘 ゾウを越えました！」
    function passedTitle(mark) {
      return "🎉 " + mark.icon + " " + mark.name + "を越えました！";
    }

    // 次の目じるしまでの棒（送る帯の上などに）。lead は上に添える1行（「今日 5,400 kg ＝ 🐘 ゾウ 0.9 頭分」など。なければ省く）
    function goalHtml(total, o) {
      var p = progress(total);
      var lead = o && o.lead;
      return [
        lead ? '<p class="ls-goal-lead">' + esc(lead) + "</p>" : "",
        '<p class="ls-goal-next">',
        '<span class="ls-goal-name">' + esc(p.next.icon + " " + (p.next.short || p.next.name)) + "まで</span>",
        '<span class="ls-goal-bar" aria-hidden="true"><span style="width:' + Math.round(p.progress * 100) + '%"></span></span>',
        '<span class="ls-goal-rest">' + esc(rest(total, p, true)) + "</span>",
        "</p>"
      ].join("");
    }

    // 目じるし1行（押すと「いま ◯ 頭分」「いま 79％」が開く）
    function rowHtml(total, className, prefix, mark, extra) {
      return (
        '<li class="' + className + '"><details class="ls-ms-row"><summary>' +
        '<span class="ls-ms-mark">' + esc(prefix + mark.icon + " " + mark.name) + '</span><span class="ls-ms-value">' + esc(markValue(mark.value)) + "</span>" +
        (extra || "") +
        '</summary><p class="ls-ms-now">' + esc(standing(total, mark)) + "</p></details></li>"
      );
    }

    /**
     * 目じるしの表：合計とくらべ・次までの棒・越えた目じるし（新しい3つ。それより前は「ほかに ◯ 個を越えました」を押すと開く）・
     * 次の目じるし（「あと ◯」）・その先（big は見せ、あいだは「🔒 この間に、あと ◯ 個」）。o.title・o.hint は上の見出しと下の説明
     */
    function tableHtml(total, o) {
      var v = Math.max(0, Number(total) || 0);
      var p = progress(v);
      var passed = marksFor(v).slice(0, p.passedCount);
      var recent = passed.slice(-3);
      var older = passed.slice(0, passed.length - recent.length);
      var rows = [];
      if (older.length) {
        rows.push(
          '<li class="is-passed is-older"><details class="ls-ms-older"><summary><span class="ls-ms-mark">✅ ほかに ' + older.length + " 個を越えました</span></summary>" +
            '<ol class="ls-ms-marks">' + older.map(function (mark) { return rowHtml(v, "is-passed", "✅ ", mark); }).join("") + "</ol></details></li>"
        );
      }
      recent.forEach(function (mark) {
        rows.push(rowHtml(v, "is-passed", "✅ ", mark));
      });
      rows.push(rowHtml(v, "is-next", "🎯 ", p.next, '<span class="ls-ms-rest">' + esc(rest(v, p)).replace(/^(あと |いま )(.*)$/, "$1<b>$2</b>") + "</span>"));
      ahead(v).forEach(function (row) {
        rows.push(row.mark ? rowHtml(v, "is-ahead", "", row.mark) : '<li class="is-locked"><span class="ls-ms-mark">🔒 この間に、あと ' + row.locked + " 個</span></li>");
      });
      var title = o && o.title;
      var hint = o && o.hint;
      return [
        '<section class="ls-ms"' + (title ? ' aria-label="' + esc(title.replace(/^\S+\s/, "")) + '"' : "") + ">",
        title ? '<p class="ls-ms-title">' + esc(title) + "</p>" : "",
        '<p class="ls-ms-total"><b>' + esc(amount(v)) + "</b>" + (v > 0 ? '<span class="ls-ms-compare">＝ ' + esc(compareLabel(v)) + "</span>" : "") + "</p>",
        '<div class="ls-ms-bar" aria-hidden="true"><span style="width:' + Math.round(p.progress * 100) + '%"></span></div>',
        '<ol class="ls-ms-marks">' + rows.join("") + "</ol>",
        '<p class="ls-hint">目じるしを押すと、いまの合計とくらべられます。' + (hint ? esc(hint) : "") + "</p>",
        "</section>"
      ].join("");
    }

    return {
      marks: marks,
      marksFor: marksFor,
      progress: progress,
      newlyPassed: newlyPassed,
      ahead: ahead,
      compare: compare,
      compareLabel: compareLabel,
      standing: standing,
      rest: rest,
      passedTitle: passedTitle,
      goalHtml: goalHtml,
      tableHtml: tableHtml
    };
  }

  return {
    COUNTED_MAX: COUNTED_MAX,
    bigNumber: bigNumber,
    ratioLabel: ratioLabel,
    shareLabel: shareLabel,
    ledgerIn: ledgerIn,
    syncLedger: syncLedger,
    loadLedger: loadLedger,
    saveLedger: saveLedger,
    create: create
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QMilestones;
else if (typeof window !== "undefined") window.QMilestones = QMilestones;
