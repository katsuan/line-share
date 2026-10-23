// LINE に送る Flex Message の組み立て。色は styles.css のトークンと揃える。
import { headerFlex } from "./header.js?v=202610232304";
const COLOR = {
  text: "#1F1F1C",
  subtext: "#6B6860",
  surface: "#F4F4F1",
  accent: "#6C47FF",
  badgeBg: "#EFEBFF"
};

export function createPlaceFlex({ mapUrl, title, address, photoUrl, comment, badges, header }) {
  const name = title || "Google Maps";
  const bodyContents = [
    {
      type: "text",
      text: `📍 ${name}`,
      weight: "bold",
      size: "lg",
      color: COLOR.text,
      flex: 0,
      wrap: true
    }
  ];

  if (address) {
    bodyContents.push({
      type: "text",
      text: address,
      size: "sm",
      color: COLOR.subtext,
      flex: 0,
      wrap: true
    });
  }

  if (badges.length > 0) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      flex: 0,
      contents: badges.slice(0, 5).map(createBadgeBox_)
    });
  }

  if (comment) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR.surface,
      cornerRadius: "md",
      paddingAll: "md",
      contents: [
        { type: "text", text: "コメント", size: "xs", color: COLOR.subtext, weight: "bold", flex: 0 },
        { type: "text", text: comment, size: "sm", color: COLOR.text, wrap: true, margin: "xs", flex: 0 }
      ]
    });
  }

  return {
    type: "flex",
    altText: `マップ情報「📍 ${name}」の共有です！`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "giga",
      header: headerFlex(header),
      hero: createHero_(photoUrl, mapUrl),
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: bodyContents
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [createButton_("地図を開く", mapUrl, "primary")]
      }
    }
  };
}

export function createEventFlex(data, calendarUrl, labels) {
  const bodyContents = [
    {
      type: "text",
      text: data.title,
      wrap: true,
      size: "xl",
      weight: "bold",
      color: COLOR.text
    },
    createInfoBlock_("日時", labels.when)
  ];

  if (data.location) {
    bodyContents.push(createInfoRow_("場所", data.location));
  }

  if (data.details) {
    bodyContents.push(createInfoRow_("詳細", data.details));
  }

  const buttons = [createButton_("Googleカレンダーに予定を追加", calendarUrl, "primary")];
  if (data.mapUrl) {
    buttons.push(createButton_("地図を開く", data.mapUrl, "secondary"));
  }
  if (data.url) {
    buttons.push(createButton_("関連URLを開く", data.url, "secondary"));
  }

  return {
    type: "flex",
    altText: `予定を共有: ${data.title}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: headerFlex(data.header),
      hero: createHero_(data.photoUrl, data.mapUrl || calendarUrl),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "18px",
        contents: bodyContents
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: buttons
      }
    }
  };
}

function createHero_(photoUrl, uri) {
  if (!photoUrl) return undefined;
  return {
    type: "image",
    url: photoUrl,
    size: "full",
    aspectRatio: "20:13",
    aspectMode: "cover",
    action: { type: "uri", uri }
  };
}

function createButton_(label, uri, style) {
  return {
    type: "button",
    style,
    ...(style === "primary" ? { color: COLOR.accent } : {}),
    action: { type: "uri", label, uri }
  };
}

// 見出しの下に全幅で書く1列（日時など、長くなる項目）
function createInfoBlock_(label, value) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    paddingAll: "12px",
    backgroundColor: COLOR.surface,
    cornerRadius: "12px",
    contents: [
      { type: "text", text: label, size: "xs", color: COLOR.subtext, weight: "bold" },
      { type: "text", text: value, size: "sm", color: COLOR.text, wrap: true }
    ]
  };
}

function createInfoRow_(label, value) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "md",
    paddingAll: "12px",
    backgroundColor: COLOR.surface,
    cornerRadius: "12px",
    contents: [
      { type: "text", text: label, size: "xs", color: COLOR.subtext, weight: "bold", flex: 2 },
      { type: "text", text: value, size: "sm", color: COLOR.text, wrap: true, flex: 5 }
    ]
  };
}

function createBadgeBox_(label) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.badgeBg,
    cornerRadius: "xxl",
    paddingAll: "sm",
    flex: 0,
    contents: [{ type: "text", text: label, size: "xs", color: COLOR.accent, weight: "bold", flex: 0 }]
  };
}
