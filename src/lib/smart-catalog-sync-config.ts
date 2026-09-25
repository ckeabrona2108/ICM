export type SmartCanonicalColumn =
  | "title"
  | "artist"
  | "label"
  | "upc"
  | "isrc"
  | "release_date"
  | "end_date"
  | "track_number"
  | "platform"
  | "usage_period"
  | "rights_type"
  | "territory"
  | "content_type"
  | "usage_type"
  | "quantity"
  | "streams"
  | "paid_streams"
  | "gross_amount"
  | "royalty_author"
  | "royalty_related"
  | "royalty_total"
  | "album_title"
  | "lyrics_author"
  | "music_author"
  | "author_rights_share"
  | "related_rights_share"
  | "licensee_code"
  | "internal_code"
  | "genre"
  | "language"
  | "explicit"
  | "composer"
  | "publisher"
  | "artwork_url"
  | "duration";

export const SMART_COLUMN_SYNONYMS: Record<SmartCanonicalColumn, string[]> = {
  title: [
    "Track Title",
    "Song",
    "Song Name",
    "Title",
    "Название",
    "Трек",
    "Название трека",
    "Композиция",
    "Наименование"
  ],
  artist: ["Artist", "Primary Artist", "Main Artist", "Исполнитель", "Артист", "Performer"],
  label: ["Label", "Лейбл", "Правообладатель"],
  upc: ["UPC", "EAN", "Product UPC", "Barcode", "Штрихкод"],
  isrc: ["ISRC", "Track ISRC", "Код трека"],
  release_date: [
    "Release Date",
    "Launch Date",
    "Date",
    "Дата релиза",
    "Начало реализации",
    "Период начала"
  ],
  end_date: ["End Date", "Окончание реализации", "Period End", "Период окончания"],
  track_number: ["Track Number", "No.", "№", "Номер трека", "Track No"],
  platform: ["Platform", "Store", "DSP", "Платформа", "Площадка", "Магазин"],
  usage_period: ["Usage Period", "Период использования"],
  rights_type: ["Rights Type", "Тип прав"],
  territory: ["Territory", "Country", "Страна", "Территория"],
  content_type: ["Content Type", "Тип контента"],
  usage_type: ["Usage Type", "Вид использования", "Type"],
  quantity: ["Quantity", "Count", "Streams", "Количество", "Прослушивания"],
  streams: ["All Streams", "Все прослушивания"],
  paid_streams: ["Pay Streams", "Paid Streams", "Прослушивания >30 секунд", "Платные прослушивания"],
  gross_amount: ["Gross Amount", "Собранная сумма", "Сумма до комиссии", "Revenue", "Доход"],
  royalty_author: [
    "Вознаграждение Лицензиара (Авторские)",
    "Вознаграждение ЛИЦЕНЗИАРА за авторские права",
    "Author Royalty",
    "Publishing Royalty",
    "Авторские"
  ],
  royalty_related: [
    "Вознаграждение Лицензиара (Смежные)",
    "Вознаграждение ЛИЦЕНЗИАРА за смежные права",
    "Related Rights Royalty",
    "Neighboring Royalty",
    "Смежные"
  ],
  royalty_total: [
    "Вознаграждение Лицензиара (Всего)",
    "Итого вознаграждение ЛИЦЕНЗИАРА",
    "Total Royalty",
    "Net Royalty",
    "К выплате",
    "К начислению",
    "Всего"
  ],
  album_title: ["Album", "Album Title", "Название альбома", "Альбом"],
  lyrics_author: ["Lyrics Author", "Автор слов", "Автор текста"],
  music_author: ["Music Author", "Автор музыки"],
  author_rights_share: ["Author Rights Share", "Доля авторских прав Лицензиара", "Доля авторских прав"],
  related_rights_share: ["Related Rights Share", "Доля смежных прав Лицензиара", "Доля смежных прав"],
  licensee_code: ["Licensee Code", "Код лицензиара", "RCID"],
  internal_code: ["Код", "Code", "Internal Code", "Catalog Code"],
  genre: ["Genre", "Жанр"],
  language: ["Language", "Язык"],
  explicit: ["Explicit", "18+", "Нецензурный"],
  composer: ["Composer", "Композитор"],
  publisher: ["Publisher", "Издатель"],
  artwork_url: ["Artwork URL", "Cover URL", "Обложка", "Обложка URL"],
  duration: ["Duration", "Длительность", "Length"]
};

export const SMART_COLUMN_PRIORITY: SmartCanonicalColumn[] = [
  "isrc",
  "upc",
  "track_number",
  "title",
  "artist",
  "label",
  "release_date",
  "end_date",
  "platform",
  "usage_period",
  "rights_type",
  "territory",
  "content_type",
  "usage_type",
  "quantity",
  "streams",
  "paid_streams",
  "gross_amount",
  "royalty_author",
  "royalty_related",
  "royalty_total",
  "album_title",
  "lyrics_author",
  "music_author",
  "author_rights_share",
  "related_rights_share",
  "licensee_code",
  "internal_code",
  "genre",
  "language",
  "explicit",
  "composer",
  "publisher",
  "artwork_url",
  "duration"
];

export const SMART_SUPPORTED_ENCODINGS = ["utf-8", "utf-8-bom", "windows-1251"] as const;

export const SMART_SUPPORTED_DELIMITERS = [",", ";", "\t", "|"] as const;

export const SMART_DEFAULT_PLATFORM_COMMISSION_RATE = 0.4;

export const SMART_CATALOG_UPDATABLE_FIELDS = [
  "isrc",
  "upc",
  "release_date",
  "genre",
  "language",
  "explicit",
  "composer",
  "publisher",
  "artwork_url",
  "duration",
  "track_number",
  "artist",
  "title",
  "label"
] as const;
