import type { LeisureKind } from "./types";

export type LeisureArtworkEntry = {
  title: string;
  kind: LeisureKind;
  src: string;
  width: number;
  height: number;
  sourceUrl: string;
  credit: string;
  position?: string;
  alt: string;
  assetType: string;
  editionNote?: string;
};

/** Curated public artwork only. Never resolve URLs supplied in private content. */
export const leisureArtwork: readonly LeisureArtworkEntry[] = [
  {
    "title": "无耻之徒（美版）",
    "kind": "series",
    "src": "https://is1-ssl.mzstatic.com/image/thumb/eUbS72fVXarUemq1CzEc7A/1200x675.jpg",
    "width": 1200,
    "height": 675,
    "sourceUrl": "https://tv.apple.com/in/show/shameless-us/umc.cmc.699yz0ndcm42cxcwcbzkb6dng",
    "credit": "宣传图片来源：Apple TV；版权归各权利人所有",
    "alt": "《无耻之徒（美版）》Gallagher 一家围在沙发旁的官方宣传封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "德里女孩",
    "kind": "series",
    "src": "https://occ-0-4249-1007.1.nflxso.net/dnm/api/v6/6AYY37jfdO6hpXcMjf9Yu5cnmO0/AAAABXD9TjwbHRNHnzTQsfyoin6XqL8LJ7gohILq1Yu1wL1TJcv7FDrICYMOUE4qlaXPfnUV8ecn0bfA35bIkd4CYIQoRcz6jbBAkse4.jpg?r=f80",
    "width": 1280,
    "height": 720,
    "sourceUrl": "https://www.netflix.com/title/80238565",
    "credit": "宣传图片来源：Netflix；版权归各权利人所有",
    "alt": "《德里女孩》五位主角站在城市上方的草坡上",
    "assetType": "official_promotional_still",
    "editionNote": ""
  },
  {
    "title": "足球教练",
    "kind": "series",
    "src": "https://is1-ssl.mzstatic.com/image/thumb/eD8DZGJ170t3MyFhlWOkdw/1200x675.jpg",
    "width": 1200,
    "height": 675,
    "sourceUrl": "https://tv.apple.com/us/show/ted-lasso/umc.cmc.vtoh0mn0xn7t3c643xqonfzy",
    "credit": "宣传图片来源：Apple TV；版权归各权利人所有",
    "alt": "《足球教练》Ted Lasso 戴帽和墨镜的官方宣传封面",
    "assetType": "official_cover_art",
    "editionNote": "Series-level Apple TV promotional cover; not proof of any viewing progress."
  },
  {
    "title": "公寓大楼里的谋杀案",
    "kind": "series",
    "src": "https://press.hulu.com/storage/uploads/CE/2B/CE2B5584-A4DC-B32F-4217-E7D51381CE11/Only-Murders-In-The-Building-S04-Hulu_Hero-632x396.jpg",
    "width": 632,
    "height": 396,
    "sourceUrl": "https://press.hulu.com/shows/only-murders-in-the-building/",
    "credit": "宣传图片来源：Hulu Press；版权归各权利人所有",
    "alt": "《公寓大楼里的谋杀案》三位主角走在纽约街头的官方宣传剧照",
    "assetType": "official_promotional_still",
    "editionNote": "Season 4 promotional still used to identify the series; does not imply recommendation starts at season 4."
  },
  {
    "title": "利刃出鞘",
    "kind": "film",
    "src": "https://dx35vtwkllhj9.cloudfront.net/lionsgateus/knives-out/images/regions/us/onesheet.jpg",
    "width": 716,
    "height": 1075,
    "sourceUrl": "https://app.powster.com/lionsgateus/knives-out/us/synopsis/",
    "credit": "宣传图片来源：Lionsgate；版权归各权利人所有",
    "alt": "《利刃出鞘》家族群像官方海报",
    "assetType": "official_poster",
    "editionNote": ""
  },
  {
    "title": "布达佩斯大饭店",
    "kind": "film",
    "src": "https://is1-ssl.mzstatic.com/image/thumb/Video113/v4/c4/b0/dc/c4b0dcd8-7355-2a2a-df0d-090b74f66d58/GrandBudapestHotel_CoverArt_3840x2160.lsr/1200x675.jpg",
    "width": 1200,
    "height": 675,
    "sourceUrl": "https://tv.apple.com/us/movie/the-grand-budapest-hotel/umc.cmc.1yrchfyt6pyg3g827zdo6br38?playableId=tvs.sbd.9001%3A828777452",
    "credit": "宣传图片来源：Apple TV；版权归各权利人所有",
    "alt": "《布达佩斯大饭店》粉色酒店与山景官方封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "帕丁顿熊2",
    "kind": "film",
    "src": "https://is1-ssl.mzstatic.com/image/thumb/Video114/v4/da/44/dd/da44ddeb-a23b-41db-be6d-e41925393ae2/pr_source.lsr/1200x675.jpg",
    "width": 1200,
    "height": 675,
    "sourceUrl": "https://tv.apple.com/us/movie/paddington-2/umc.cmc.6uanyirozllokd56zsopx7no1",
    "credit": "宣传图片来源：Apple TV；版权归各权利人所有",
    "alt": "《帕丁顿熊2》戴红帽的小熊与片名官方封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "蜘蛛侠：平行宇宙",
    "kind": "film",
    "src": "https://www.sonypictures.com/sites/default/files/styles/max_860x460/public/title-key-art/spidermanintothespiderverse_onesheet_1400x2100_2026.jpg?itok=C7PWnY6k",
    "width": 307,
    "height": 460,
    "sourceUrl": "https://www.sonypictures.com/movies/spidermanintothespiderverse",
    "credit": "宣传图片来源：Sony Pictures；版权归各权利人所有",
    "alt": "《蜘蛛侠：平行宇宙》迈尔斯与蜘蛛侠群像官方海报",
    "assetType": "official_poster",
    "editionNote": "Official current one-sheet for the 2018 film, although filename contains 2026."
  },
  {
    "title": "超级马力欧 奥德赛 / Super Mario Odyssey",
    "kind": "game",
    "src": "https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch/70010000001130/c42553b4fd0312c31e70ec7468c6c9bccd739f340152925b9600631f2d29f8b5",
    "width": 2400,
    "height": 1350,
    "sourceUrl": "https://www.nintendo.com/us/store/products/super-mario-odyssey-switch/",
    "credit": "宣传图片来源：Nintendo；版权归各权利人所有",
    "alt": "《超级马力欧 奥德赛》马力欧与凯皮官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "塞尔达传说 王国之泪 Nintendo Switch 2 Edition",
    "kind": "game",
    "src": "https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000096821/f20258999e8d852a496dad2961a87faf2b119488f97fb81442f378043e58b000",
    "width": 2400,
    "height": 1350,
    "sourceUrl": "https://www.nintendo.com/us/store/products/the-legend-of-zelda-tears-of-the-kingdom-nintendo-switch-2-edition-switch-2/",
    "credit": "宣传图片来源：Nintendo；版权归各权利人所有",
    "alt": "《塞尔达传说 王国之泪 Nintendo Switch 2 Edition》林克眺望天空群岛官方封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "星之卡比 探索发现 Nintendo Switch 2 Edition + 星耀世界",
    "kind": "game",
    "src": "https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000096829/0a06bf277f1eb585fcbb7ddeb4f70014fd1c860d326eb33c8accf4d4827ade72",
    "width": 2400,
    "height": 1350,
    "sourceUrl": "https://www.nintendo.com/us/store/products/kirby-and-the-forgotten-land-nintendo-switch-2-edition-plus-star-crossed-world-switch-2/",
    "credit": "宣传图片来源：Nintendo；版权归各权利人所有",
    "alt": "《星之卡比 探索发现 Nintendo Switch 2 Edition + 星耀世界》卡比与星耀世界官方封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "马力欧卡丁车 世界 / Mario Kart World",
    "kind": "game",
    "src": "https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000095431/0485f410193ca12f92a2f615ea608bb437540f321bd05e464593c33fefa09bf2",
    "width": 2400,
    "height": 1350,
    "sourceUrl": "https://www.nintendo.com/us/store/products/mario-kart-world-switch-2/",
    "credit": "宣传图片来源：Nintendo；版权归各权利人所有",
    "alt": "《马力欧卡丁车 世界》赛车角色群像官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "宇宙机器人 / ASTRO BOT",
    "kind": "game",
    "src": "https://image.api.playstation.com/vulcan/ap/rnd/202406/0500/8f15268257b878597757fcc5f2c9545840867bc71fc863b1.png",
    "width": 1024,
    "height": 1024,
    "sourceUrl": "https://www.playstation.com/en-us/games/astro-bot/",
    "credit": "宣传图片来源：PlayStation / Sony Interactive Entertainment；版权归各权利人所有",
    "alt": "《宇宙机器人》Astro 与机器人伙伴官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "双人成行 / It Takes Two",
    "kind": "game",
    "src": "https://image.api.playstation.com/vulcan/ap/rnd/202012/0815/7CRynuLSAb0vysSC4TmZy5e4.png",
    "width": 1024,
    "height": 1024,
    "sourceUrl": "https://www.playstation.com/en-us/games/it-takes-two/",
    "credit": "宣传图片来源：PlayStation / Electronic Arts；版权归各权利人所有",
    "alt": "《双人成行》Cody 与 May 冒险官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "Stray（常称《迷失》）",
    "kind": "game",
    "src": "https://image.api.playstation.com/vulcan/ap/rnd/202206/0300/E2vZwVaDJbhLZpJo7Q10IyYo.png",
    "width": 1024,
    "height": 1024,
    "sourceUrl": "https://www.playstation.com/zh-hant-hk/games/stray/",
    "credit": "宣传图片来源：PlayStation / Annapurna Interactive；版权归各权利人所有",
    "alt": "《Stray》橘猫与霓虹背景官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  },
  {
    "title": "Tetris Effect: Connected（俄罗斯方块：效应 连接）",
    "kind": "game",
    "src": "https://image.api.playstation.com/vulcan/ap/rnd/202301/2006/Jjqj4oIcWvyV4jGpDQkTsSag.png",
    "width": 1024,
    "height": 1024,
    "sourceUrl": "https://www.playstation.com/en-us/games/tetris-effect/",
    "credit": "宣传图片来源：PlayStation / Enhance；版权归各权利人所有",
    "alt": "《Tetris Effect: Connected》发光方块与 Connected 片名官方游戏封面",
    "assetType": "official_cover_art",
    "editionNote": ""
  }
];

export function getLeisureArtwork(item: { title: string; kind: LeisureKind }) {
  return leisureArtwork.find((art) => art.kind === item.kind && normalizeArtworkTitle(art.title) === normalizeArtworkTitle(item.title));
}

/** A display-only continuation suffix is not part of a work’s identity. */
function normalizeArtworkTitle(title: string) {
  return title.normalize("NFKC").replace(/\s*·\s*继续看$/, "").trim().toLocaleLowerCase();
}
