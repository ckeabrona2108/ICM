export type TicketStatus = "awaiting" | "active" | "resolved";

export interface ChatMessage {
  id: string;
  role: "user" | "admin";
  text: string;
  at: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  messages: ChatMessage[];
  updatedAt: string;
  pendingAutoReply?: boolean;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  awaiting: "Ожидает ответа",
  active: "В работе",
  resolved: "Закрыт"
};

export const INITIAL_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: "t1",
    subject: "Проверка UPC",
    status: "active",
    updatedAt: "Сегодня, 11:42",
    messages: [
      {
        id: "m1",
        role: "user",
        text: "Здравствуйте, подскажите, верен ли формат UPC для моего релиза?",
        at: "Сегодня, 09:10"
      },
      {
        id: "m2",
        role: "admin",
        text: "Добрый день! Модерация подтвердила формат UPC, всё корректно.",
        at: "Сегодня, 11:42"
      }
    ]
  },
  {
    id: "t2",
    subject: "Расхождение в отчёте по роялти",
    status: "awaiting",
    updatedAt: "Вчера, 21:12",
    messages: [
      {
        id: "m3",
        role: "user",
        text: "Не сходится сумма за февраль, приложу выписку чуть позже.",
        at: "Вчера, 20:40"
      }
    ]
  },
  {
    id: "t3",
    subject: "Умная ссылка кампании",
    status: "resolved",
    updatedAt: "21 апр.",
    messages: [
      {
        id: "m4",
        role: "user",
        text: "Ссылка не открывается на части устройств.",
        at: "20 апр., 14:00"
      },
      {
        id: "m5",
        role: "admin",
        text: "Ссылка обновлена, трекинг включён. Проверьте, пожалуйста.",
        at: "21 апр., 10:15"
      }
    ]
  }
];
