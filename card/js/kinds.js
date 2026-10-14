// お知らせカード：形式ごとの部品（投票・チェックリスト・チケット・クーポン）

// ---- 投票・チェックリスト ----

// 1行の頭の記号（□・-・1. など）を外す。貼り付けた一覧を項目に分けるときに使う
function cleanItem(line) {
  return line.replace(/^\s*(?:[□☐■☑✓✔✅\-−ー・*•]|\d+[.)．、])\s*/u, "").trim();
}

// 複数行を貼ったら1行ずつ項目にする。1行目が記号なしで、本文タイトルが空なら、それをタイトルにする
function splitPasted(text, index) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const markers = /^\s*(?:[□☐■☑✓✔✅\-−ー・*•]|\d+[.)．、])/u;
  if (!state.title && !markers.test(lines[0]) && lines.slice(1).some((line) => markers.test(line))) {
    state.title = lines.shift();
    els.titleInput.value = state.title;
  }
  const max = KINDS[state.kind].max;
  state.items.splice(index, 1, ...lines.map(cleanItem).filter(Boolean));
  state.items = state.items.slice(0, max);
  return true;
}

function renderKindChips() {
  els.kindChips.replaceChildren(
    ...Object.entries(KINDS).map(([key, kind]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ls-chip is-small";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(state.kind === key));
      chip.classList.toggle("is-active", state.kind === key);
      chip.textContent = kind.label;
      chip.addEventListener("click", () => setKind(key));
      return chip;
    })
  );
}

function setKind(kind) {
  if (state.kind === kind) return;
  state.kind = kind;
  // 候補・項目が足りなければ空の欄を用意して、すぐ入力できるように
  if (KINDS[kind].list) {
    while (state.items.length < KINDS[kind].min) state.items.push("");
  }
  if (kind === "ticket" && state.pairs.length === 0) {
    state.pairs = [{ label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" }];
  }
  render();
  if (KINDS[kind].list) els.itemsArea.querySelector("input")?.focus();
  if (kind === "ticket") els.routeFrom.focus();
  if (kind === "coupon") els.couponOffer.focus();
}

// 投票の候補・チェックリストの項目をプレビューの中で直接編集する（入力中は作り直さない）
function renderItemsPreview(palette) {
  renderKindChips();
  renderTicketPreview(palette);
  const kind = KINDS[state.kind];
  const active = Boolean(kind.list);
  els.itemsArea.hidden = !active;
  els.itemAddButton.hidden = !active || state.items.length >= (kind.max || 0);
  els.doneButton.hidden = state.kind !== "checklist";
  if (!active) return;
  els.itemAddButton.textContent = `＋ ${kind.item}`;
  els.itemsArea.dataset.kind = state.kind;
  els.doneButton.style.background = palette.start;
  if (document.activeElement !== els.doneButton) els.doneButton.value = state.doneLabel;

  const rows = els.itemsArea.querySelectorAll(".bubble-item");
  if (els.itemsArea.contains(document.activeElement) && rows.length === state.items.length) {
    rows.forEach((row) => (row.style.borderColor = palette.start));
    return;
  }
  els.itemsArea.replaceChildren(...state.items.map((text, index) => createItemRow(text, index, palette)));
}

function createItemRow(text, index, palette) {
  const kind = KINDS[state.kind];
  const row = document.createElement("div");
  row.className = "bubble-item";
  row.style.borderColor = palette.start;
  if (state.kind === "checklist") {
    const box = document.createElement("span");
    box.className = "bubble-item-box";
    box.setAttribute("aria-hidden", "true");
    box.textContent = "□";
    row.append(box);
  }
  const input = document.createElement("input");
  input.type = "text";
  input.className = "bubble-input bubble-item-input";
  input.maxLength = 40;
  input.value = text;
  input.placeholder = state.kind === "vote" ? `候補${index + 1}（例：🏖️ 沖縄）` : `項目${index + 1}（例：財布）`;
  input.setAttribute("aria-label", `${kind.item}${index + 1}`);
  input.addEventListener("input", () => {
    state.items[index] = input.value.trim();
    render();
  });
  // 複数行を貼ったら1行ずつに分ける
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") || "";
    if (!pasted.includes("\n")) return;
    event.preventDefault();
    if (splitPasted(pasted, index)) {
      input.blur();
      render();
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (state.items.length < kind.max) {
        state.items.splice(index + 1, 0, "");
        input.blur();
        render();
        els.itemsArea.querySelectorAll("input")[index + 1]?.focus();
      }
    }
  });
  const remove = removeOnEdit(`${kind.item}${index + 1}を消す`, () => {
    state.items.splice(index, 1);
    render();
  });
  row.append(input, remove);
  return row;
}

// ---- チケット・クーポン ----

// 入力中の欄は書き換えない
function setValue(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function renderTicketPreview(palette) {
  els.ticketArea.hidden = state.kind !== "ticket";
  els.couponArea.hidden = state.kind !== "coupon";
  if (state.kind === "ticket") {
    setValue(els.routeFrom, state.route.from);
    setValue(els.routeFromSub, state.route.fromSub);
    setValue(els.routeTo, state.route.to);
    setValue(els.routeToSub, state.route.toSub);
    els.pairAddButton.hidden = state.pairs.length >= MAX_PAIRS;
    const editing = els.pairsArea.contains(document.activeElement);
    if (!editing || els.pairsArea.children.length !== state.pairs.length) {
      els.pairsArea.replaceChildren(...state.pairs.map(createPairCell));
    }
  }
  if (state.kind === "coupon") {
    setValue(els.couponOffer, state.coupon.offer);
    setValue(els.couponCode, state.coupon.code);
    setValue(els.couponExpiry, state.coupon.expiry);
    els.couponOffer.style.color = palette.start;
  }
}

function createPairCell(pair, index) {
  const cell = document.createElement("div");
  cell.className = "ticket-pair";
  const label = document.createElement("input");
  label.className = "bubble-input ticket-pair-label";
  label.maxLength = 20;
  label.value = pair.label;
  label.placeholder = ["例：便名", "例：ゲート", "例：座席", "項目名", "項目名", "項目名"][index] || "項目名";
  label.setAttribute("aria-label", `項目${index + 1}の名前`);
  label.addEventListener("input", () => {
    state.pairs[index].label = label.value.trim();
    render();
  });
  const value = document.createElement("input");
  value.className = "bubble-input ticket-pair-value";
  value.maxLength = 30;
  value.value = pair.value;
  value.placeholder = ["C1212", "43D", "31B", "値", "値", "値"][index] || "値";
  value.setAttribute("aria-label", `項目${index + 1}の値`);
  value.addEventListener("input", () => {
    state.pairs[index].value = value.value.trim();
    render();
  });
  const remove = removeOnEdit(`項目${index + 1}を消す`, () => {
    state.pairs.splice(index, 1);
    render();
  });
  cell.append(label, value, remove);
  return cell;
}

// 欠け丸付きのミシン目。幅 10px の箱に直径 20px の丸を寄せて置き、はみ出た半分が切り取られて半円に見える
function perforationFlex() {
  const notch = (side) => ({
    type: "box",
    layout: "vertical",
    width: "10px",
    height: "20px",
    contents: [
      {
        type: "box",
        layout: "vertical",
        position: "absolute",
        width: "20px",
        height: "20px",
        cornerRadius: "10px",
        backgroundColor: NOTCH_COLOR,
        offsetTop: "0px",
        ...(side === "start" ? { offsetEnd: "0px" } : { offsetStart: "0px" }),
        contents: []
      }
    ]
  });
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    contents: [
      notch("start"),
      { type: "box", layout: "vertical", flex: 1, paddingStart: "8px", paddingEnd: "8px", contents: [{ type: "separator", color: "#D7DCE3" }] },
      notch("end")
    ]
  };
}

function ticketFlex(palette) {
  const big = (text) => ({ type: "text", text: text || " ", size: "xxl", weight: "bold", color: "#111827", wrap: true });
  const small = (text) => ({ type: "text", text: text || " ", size: "xs", color: "#6B7280", wrap: true });
  const route = {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "md",
    contents: [
      { type: "box", layout: "vertical", flex: 1, contents: [big(state.route.from), small(state.route.fromSub)] },
      { type: "text", text: "→", size: "xl", color: palette.start, flex: 0, weight: "bold" },
      { type: "box", layout: "vertical", flex: 1, contents: [{ ...big(state.route.to), align: "end" }, { ...small(state.route.toSub), align: "end" }] }
    ]
  };
  // 値のない項目は送らない（項目名だけ並んでも意味がないので）
  const pairs = state.pairs.filter((pair) => pair.value);
  const rows = [];
  for (let i = 0; i < pairs.length; i += 3) {
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      contents: [0, 1, 2].map((j) => {
        const pair = pairs[i + j];
        return pair
          ? {
              type: "box",
              layout: "vertical",
              flex: 1,
              contents: [
                { type: "text", text: pair.label || " ", size: "xxs", color: "#9CA3AF", weight: "bold" },
                { type: "text", text: pair.value || " ", size: "md", color: "#111827", weight: "bold", wrap: true }
              ]
            }
          : { type: "box", layout: "vertical", flex: 1, contents: [] };
      })
    });
  }
  return { top: [route], bottom: rows };
}

function couponFlex(palette) {
  const top = [{ type: "text", text: state.coupon.offer || " ", size: "3xl", weight: "bold", color: palette.start, align: "center", wrap: true }];
  const bottom = [];
  if (state.coupon.code) {
    bottom.push({
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      cornerRadius: "10px",
      borderWidth: "1px",
      borderColor: palette.start,
      contents: [
        { type: "text", text: "コード", size: "xxs", color: "#9CA3AF", align: "center" },
        { type: "text", text: state.coupon.code, size: "xl", weight: "bold", color: "#111827", align: "center", wrap: true }
      ]
    });
  }
  if (state.coupon.expiry) {
    bottom.push({ type: "text", text: `有効期限：${state.coupon.expiry}`, size: "sm", color: "#6B7280", align: "center", wrap: true });
  }
  return { top, bottom };
}
