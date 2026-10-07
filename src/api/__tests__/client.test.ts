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
