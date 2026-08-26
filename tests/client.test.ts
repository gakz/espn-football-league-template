import { describe, expect, it, vi } from "vitest";
import {
  EspnError,
  cookieHeader,
  fetchSeason,
  seasonUrl,
  unwrapLeague,
} from "@/lib/espn/client";

describe("seasonUrl", () => {
  it("uses the per-season endpoint from 2018 on", () => {
    expect(seasonUrl("12345", 2024)).toContain(
      "/apis/v3/games/ffl/seasons/2024/segments/0/leagues/12345",
    );
  });

  it("uses leagueHistory before 2018", () => {
    const url = seasonUrl("12345", 2016);
    expect(url).toContain("/apis/v3/games/ffl/leagueHistory/12345");
    expect(url).toContain("seasonId=2016");
  });

  it("requests the views the ingest depends on", () => {
    const url = seasonUrl("12345", 2024);
    for (const view of ["mTeam", "mSettings", "mSchedule", "mMatchupScore", "mDraftDetail"]) {
      expect(url).toContain(`view=${view}`);
    }
  });
});

describe("cookieHeader", () => {
  it("re-adds the braces ESPN requires around SWID", () => {
    expect(cookieHeader({ swid: "ABC-123" })).toBe("SWID={ABC-123}");
    expect(cookieHeader({ swid: "{ABC-123}" })).toBe("SWID={ABC-123}");
  });

  it("sends both cookies when both are present", () => {
    expect(cookieHeader({ espnS2: "s2value", swid: "{ABC}" })).toBe(
      "espn_s2=s2value; SWID={ABC}",
    );
  });

  it("is undefined with no credentials, so public leagues send no cookie header", () => {
    expect(cookieHeader({})).toBeUndefined();
  });
});

describe("unwrapLeague", () => {
  it("unwraps the single-element array leagueHistory returns", () => {
    expect(unwrapLeague([{ id: 7 }])).toEqual({ id: 7 });
  });

  it("passes through the modern object response", () => {
    expect(unwrapLeague({ id: 7 })).toEqual({ id: 7 });
  });

  it("throws on an empty archive response rather than yielding undefined", () => {
    expect(() => unwrapLeague([])).toThrow(/empty leagueHistory/);
  });
});

describe("fetchSeason", () => {
  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;
  const fail = (status: number) => ({ ok: false, status }) as Response;

  it("returns the parsed payload", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 1 }));
    await expect(
      fetchSeason("1", 2024, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual({ id: 1 });
  });

  it("fails fast on 401 with a message pointing at the cookies", async () => {
    const fetchImpl = vi.fn(async () => fail(401));
    await expect(
      fetchSeason("1", 2024, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/espn_s2\/SWID/);
    // No point retrying an auth failure.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok({ id: 2 }));
    await expect(
      fetchSeason("1", 2024, {
        retries: 2,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ id: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on a persistent 500", async () => {
    const fetchImpl = vi.fn(async () => fail(500));
    await expect(
      fetchSeason("1", 2024, {
        retries: 1,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(EspnError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends the cookie header when credentials are supplied", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok({}));
    await fetchSeason("1", 2024, { espnS2: "abc", swid: "{XYZ}", fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).cookie).toBe("espn_s2=abc; SWID={XYZ}");
  });

  it("sends no cookie header for a public league", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok({}));
    await fetchSeason("1", 2024, { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).cookie).toBeUndefined();
  });
});
