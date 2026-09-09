import net from "node:net";

const host = "127.0.0.1";
const port = 3000;

const portIsBusy = await new Promise((resolve, reject) => {
  const socket = net.createConnection({ host, port });

  socket.setTimeout(750);
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("timeout", () => {
    socket.destroy();
    reject(new Error(`Timed out while checking ${host}:${port}`));
  });
  socket.once("error", (error) => {
    socket.destroy();
    if (error && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED") {
      resolve(false);
      return;
    }
    reject(error);
  });
});

if (portIsBusy) {
  console.error(
    `Dev server is already running on http://localhost:${port}. ` +
      "Stop it before starting another instance; parallel Next.js dev servers corrupt the shared .next directory."
  );
  process.exit(1);
}
