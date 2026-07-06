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
  | "usage_type"
  | "quantity"
  | "gross_amount"
  | "royalty_author"
  | "royalty_related"
  | "royalty_total"
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
  platform: ["Platform", "Store", "DSP", "Платформа", "Магазин"],
  usage_type: ["Usage Type", "Вид использования", "Type"],
  quantity: ["Quantity", "Count", "Streams", "Количество", "Прослушивания"],
  gross_amount: ["Gross Amount", "Собранная сумма", "Revenue", "Доход"],
  royalty_author: [
    "Вознаграждение Лицензиара (Авторские)",
    "Author Royalty",
    "Publishing Royalty",
    "Авторские"
  ],
  royalty_related: [
    "Вознаграждение Лицензиара (Смежные)",
    "Related Rights Royalty",
    "Neighboring Royalty",
    "Смежные"
  ],
  royalty_total: [
    "Вознаграждение Лицензиара (Всего)",
    "Total Royalty",
    "Net Royalty",
    "К выплате",
    "Всего"
  ],
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
  "usage_type",
  "quantity",
  "gross_amount",
  "royalty_author",
  "royalty_related",
  "royalty_total",
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
