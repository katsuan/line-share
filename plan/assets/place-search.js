import { CONFIG } from "./config.js?v=202610232231";
import { isHttpsUrl, setMessage, toUserMessage, UserError } from "./common.js?v=202610232231";

// Google Maps JavaScript API（Places）で場所を検索する。サーバー不要。
let mapsLoading = null;

export function hasPlaceSearch() {
  return Boolean(CONFIG.googleMapsApiKey);
}

function loadMaps_() {
  if (window.google?.maps?.importLibrary) {
    return Promise.resolve();
  }
  mapsLoading ??= new Promise((resolve, reject) => {
    window.__lineShareMapsReady = resolve;
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(CONFIG.googleMapsApiKey)}` +
      "&v=weekly&loading=async&language=ja&region=JP&callback=__lineShareMapsReady";
    script.async = true;
    script.onerror = () => {
      mapsLoading = null;
      reject(new Error("Google Maps の読み込みに失敗しました。"));
    };
    document.head.append(script);
  });
  return mapsLoading;
}

export async function searchPlaces(query) {
  const textQuery = query.trim();
  if (!textQuery) {
    throw new UserError("場所名や住所を入力してください。");
  }

  try {
    await loadMaps_();
    const { Place } = await google.maps.importLibrary("places");
    const { places } = await Place.searchByText({
      textQuery,
      fields: ["displayName", "formattedAddress", "photos", "googleMapsURI"],
      language: "ja",
      region: "jp",
      maxResultCount: 5
    });

    return places.map((place) => {
      const photoUrl = place.photos?.[0]?.getURI({ maxWidth: 1200 }) || "";
      return {
        title: place.displayName || "",
        address: String(place.formattedAddress || "").replace(/^日本、\s*/, ""),
        mapUrl: place.googleMapsURI || "",
        photoUrl: isHttpsUrl(photoUrl) ? photoUrl : ""
      };
    });
  } catch (error) {
    if (error instanceof UserError) throw error;
    console.error(error);
    throw new UserError("場所を検索できませんでした。時間をおいてもう一度お試しください。");
  }
}

/**
 * 検索欄・ボタン・結果リストをつなぐ。結果をタップすると onSelect が呼ばれる。
 */
export function bindPlaceSearch({ input, button, results, message, onSelect }) {
  const container = input.closest("[data-place-search]");
  if (!hasPlaceSearch()) {
    container.hidden = true;
    return;
  }

  const idleLabel = button.textContent;

  async function run() {
    button.disabled = true;
    button.textContent = "検索中…";
    results.replaceChildren();
    try {
      const places = await searchPlaces(input.value);
      if (places.length === 0) {
        results.append(createNote_("見つかりませんでした。別の言葉で検索してください。"));
        return;
      }
      results.append(
        ...places.map((place) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "ls-list-item";
          const name = document.createElement("span");
          name.textContent = place.title;
          const address = document.createElement("small");
          address.textContent = place.address;
          item.append(name, address);
          item.addEventListener("click", () => {
            results.replaceChildren();
            input.value = "";
            onSelect(place);
          });
          return item;
        })
      );
    } catch (error) {
      setMessage(message, toUserMessage(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }

  button.addEventListener("click", run);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      run();
    }
  });
}

function createNote_(text) {
  const note = document.createElement("p");
  note.className = "ls-hint";
  note.textContent = text;
  return note;
}
