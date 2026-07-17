self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "ICECREAMMUSIC", {
    body: data.body || "Новое уведомление",
    icon: "/icon-192.png",
    badge: "/favicon-32x32.png",
    tag: data.tag,
    data: { href: data.href || "/dashboard" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/dashboard";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => "focus" in client);
    if (existing) {
      existing.navigate(href);
      return existing.focus();
    }
    return clients.openWindow(href);
  }));
});
