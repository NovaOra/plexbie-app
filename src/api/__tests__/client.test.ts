// The one way to the bot: the token only ever as a Bearer header, answers checked against
// their schema, and retries only where a repeat is harmless.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { ApiError, api, pub } from "../client";
import { myRequests, token } from "../__fixtures__/bot";

const SERVER = "https://plexbie.example";
const fetchMock = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const answer = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
});

test("the token goes in the Authorization header, never the address", async () => {
  fetchMock.mockResolvedValue(answer(200, myRequests));
  const rows = await api({ server: SERVER, token: token.token }).myRequests();
  expect(rows.map((r) => r.slot)).toEqual([7, 8, 3]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${SERVER}/api/requests`);
  expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token.token}`, "X-Plexbie": "1" });
});

test("an answer in the wrong shape is a shape error, not a crash later", async () => {
  fetchMock.mockResolvedValue(answer(200, { online: "yes" }));
  await expect(api({ server: SERVER, token: null }).status()).rejects.toMatchObject({ kind: "shape", status: 200 });
  fetchMock.mockResolvedValue(answer(200, "<html>proxy login</html>"));
  await expect(api({ server: SERVER, token: null }).status()).rejects.toMatchObject({ kind: "shape" });
});

test("a 401 is a signed-out error", async () => {
  fetchMock.mockResolvedValue(answer(401, { error: "unauthorized" }));
  const error = await api({ server: SERVER, token: token.token }).session().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).signedOut).toBe(true);
  expect((error as ApiError).message).toBe("Your sign-in has ended. Sign in again.");
});

test("the bot's own short sentence is shown; anything else is replaced", async () => {
  fetchMock.mockResolvedValue(answer(409, { error: "Already approved." }));
  await expect(api({ server: SERVER, token: null }).status()).rejects.toThrow("Already approved.");
  fetchMock.mockResolvedValue(answer(400, { error: "<script>x</script>" }));
  await expect(api({ server: SERVER, token: null }).status()).rejects.toThrow("The server said no (400).");
});

test("a read is tried again after a 5xx; the token exchange (a write) is not", async () => {
  fetchMock.mockResolvedValueOnce(answer(503, "")).mockResolvedValueOnce(answer(200, { online: true, streams: 1, libraries: [] }));
  await expect(api({ server: SERVER, token: null }).status()).resolves.toMatchObject({ online: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(answer(503, ""));
  await expect(pub.exchange(SERVER, "code", "verifier")).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("an unreachable server says so without repeating the address", async () => {
  fetchMock.mockRejectedValue(new TypeError(`Network request failed: ${SERVER}/api/mobile`));
  const error = await pub.mobileInfo(SERVER).catch((e: unknown) => e);
  expect(error).toMatchObject({ status: 0, kind: "network", message: "Couldn't reach the server." });
});

// A fetch that never answers, and fails the way fetch does once its signal aborts.
const silent = (_url: string, init?: RequestInit) => new Promise<Response>((_ok, fail) =>
  init?.signal?.addEventListener("abort", () => fail(new TypeError("Aborted"))));

test("a write gives up after 15 s, but an import and a cleanup scan wait as long as they take", async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockImplementation(silent);
    const client = api({ server: SERVER, token: token.token });
    const post = client.say("c1", "Hello", false).catch((e: unknown) => e);
    const imported = client.blockedImport("sonarr", "abc").catch((e: unknown) => e);
    const scanned = client.cleanupScan().catch((e: unknown) => e);
    let settled = "";
    void imported.then(() => { settled += "import "; });
    void scanned.then(() => { settled += "scan "; });

    await jest.advanceTimersByTimeAsync(15_000);
    expect(await post).toMatchObject({ kind: "timeout", unanswered: true });
    expect(settled).toBe("");
    await jest.advanceTimersByTimeAsync(135_000);
    expect(await imported).toMatchObject({ kind: "timeout", unanswered: true });
    expect(settled).toBe("import ");
    await jest.advanceTimersByTimeAsync(150_000);
    expect(await scanned).toMatchObject({ kind: "timeout", unanswered: true });
  } finally {
    jest.useRealTimers();
  }
});

test("a line cut after a long wait, or a proxy that gave up, is no answer rather than a no", async () => {
  jest.useFakeTimers();
  try {
    // iOS and reverse proxies cut a long silence on their own, before the app does.
    fetchMock.mockImplementation(() => new Promise((_ok, fail) => setTimeout(() => fail(new TypeError("Network request failed")), 60_000)));
    const cut = api({ server: SERVER, token: null }).cleanupScan().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await cut).toMatchObject({ kind: "timeout", unanswered: true });
  } finally {
    jest.useRealTimers();
  }
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(answer(504, "<html>Gateway Time-out</html>"));
  expect(await api({ server: SERVER, token: null }).cleanupScan().catch((e: unknown) => e)).toMatchObject({ status: 504, unanswered: true });
  // Refused outright, or never reached: those are answers.
  fetchMock.mockResolvedValue(answer(409, { error: "Already running." }));
  expect(await api({ server: SERVER, token: null }).cleanupScan().catch((e: unknown) => e)).toMatchObject({ unanswered: false });
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  expect(await api({ server: SERVER, token: null }).cleanupScan().catch((e: unknown) => e)).toMatchObject({ kind: "network", unanswered: false });
});
