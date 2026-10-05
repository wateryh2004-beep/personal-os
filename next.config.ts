import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Public promotional artwork only, never arbitrary database URLs.
    remotePatterns: [
      new URL("https://is1-ssl.mzstatic.com/image/thumb/eUbS72fVXarUemq1CzEc7A/1200x675.jpg"),
      new URL("https://occ-0-4249-1007.1.nflxso.net/dnm/api/v6/6AYY37jfdO6hpXcMjf9Yu5cnmO0/AAAABXD9TjwbHRNHnzTQsfyoin6XqL8LJ7gohILq1Yu1wL1TJcv7FDrICYMOUE4qlaXPfnUV8ecn0bfA35bIkd4CYIQoRcz6jbBAkse4.jpg?r=f80"),
      new URL("https://is1-ssl.mzstatic.com/image/thumb/eD8DZGJ170t3MyFhlWOkdw/1200x675.jpg"),
      new URL("https://press.hulu.com/storage/uploads/CE/2B/CE2B5584-A4DC-B32F-4217-E7D51381CE11/Only-Murders-In-The-Building-S04-Hulu_Hero-632x396.jpg"),
      new URL("https://dx35vtwkllhj9.cloudfront.net/lionsgateus/knives-out/images/regions/us/onesheet.jpg"),
      new URL("https://is1-ssl.mzstatic.com/image/thumb/Video113/v4/c4/b0/dc/c4b0dcd8-7355-2a2a-df0d-090b74f66d58/GrandBudapestHotel_CoverArt_3840x2160.lsr/1200x675.jpg"),
      new URL("https://is1-ssl.mzstatic.com/image/thumb/Video114/v4/da/44/dd/da44ddeb-a23b-41db-be6d-e41925393ae2/pr_source.lsr/1200x675.jpg"),
      new URL("https://www.sonypictures.com/sites/default/files/styles/max_860x460/public/title-key-art/spidermanintothespiderverse_onesheet_1400x2100_2026.jpg?itok=C7PWnY6k"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch/70010000001130/c42553b4fd0312c31e70ec7468c6c9bccd739f340152925b9600631f2d29f8b5"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000096821/f20258999e8d852a496dad2961a87faf2b119488f97fb81442f378043e58b000"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000096829/0a06bf277f1eb585fcbb7ddeb4f70014fd1c860d326eb33c8accf4d4827ade72"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch2/70010000095431/0485f410193ca12f92a2f615ea608bb437540f321bd05e464593c33fefa09bf2"),
      new URL("https://image.api.playstation.com/vulcan/ap/rnd/202406/0500/8f15268257b878597757fcc5f2c9545840867bc71fc863b1.png"),
      new URL("https://image.api.playstation.com/vulcan/ap/rnd/202012/0815/7CRynuLSAb0vysSC4TmZy5e4.png"),
      new URL("https://image.api.playstation.com/vulcan/ap/rnd/202206/0300/E2vZwVaDJbhLZpJo7Q10IyYo.png"),
      new URL("https://image.api.playstation.com/vulcan/ap/rnd/202301/2006/Jjqj4oIcWvyV4jGpDQkTsSag.png"),
      new URL("https://s3.amazonaws.com/criterion-production/films/1f9ceaaf056526c3d7c88296ce340579/WQjpoVqOb1CWcVmG1ZoaiEu0gJF0ez_large.jpg"),
      new URL("https://images.squarespace-cdn.com/content/v1/60241cb68df65b530cd84d95/ba65f8a1-8ec6-47c4-883f-323b398d483c/luca_OT.jpg"),
      new URL("https://www.sonypictures.com/sites/default/files/styles/max_860x460/public/title-key-art/amelie_rating_onesheet_1400x2100.jpg?itok=Kdc_l3yX"),
      new URL("https://images.contentstack.io/v3/assets/blt13adb7e2033fcee5/blt765efcdc17ea6201/69c4553646ffd73277f220c2/TheGoodPlaceCompleteSeries_keyart_poster.jpg?width=2560"),
      new URL("https://prod-solutionsmedia-cdn.azureedge.net/cache/6/6/6/2/2/4/6662244aaa7338eb871fcd9966394bdd200f60e9.jpg"),
      new URL("https://cdn1.edgedatg.com/aws/v2/abc/AbbottElementary/showimages/596b28bcf2744f12890659337a7da8af/1200x627-Q80_596b28bcf2744f12890659337a7da8af.jpg"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch/70010000068688/87e8aa5f1fdc950b88eae7d7c62ed185c8a6373c845090bbdb2e2cf039b38da1"),
      new URL("https://assets.nintendo.com/image/upload/c_fill,w_1200/q_auto:best/f_auto/dpr_2.0/store/software/switch/70010000002722/7d17e538e855a6214e27ce1eb782068d09bffa6ccbc75fb7a4e61773040c1ab5"),
      new URL("https://image.api.playstation.com/vulcan/img/rnd/202010/1614/TJiBEQMJ9qa93lWBu4sKScY9.png"),
      new URL("https://image.api.playstation.com/vulcan/ap/rnd/202101/2921/DwVjpbKOsFOyPdNzmSTSWuxG.png"),
      new URL("https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/1f/de/6c/1fde6cb4-9703-c214-cdc6-8ecf7d0f0aa0/197189040030.jpg/600x600bf-60.jpg"),
      new URL("https://www.daftpunk.com/img/randomaccessmemories.jpg"),
    ],
  },
  experimental: {
    // A long Notes discussion can contain the note, prior turns, and a
    // continuation marker. The framework default is 1 MB, which is too small
    // for the product's intentional long-document workflow.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
