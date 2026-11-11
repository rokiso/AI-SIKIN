import { describe, expect, it } from "vitest";
import { parseGuestId } from "@/lib/session/guest";

describe("anonymous session input", () => {
  it("accepts UUIDv4 identifiers but rejects missing, malformed and non-v4 values", () => {
    const id = "4b579c57-a36b-449f-aecc-7459783b82da";
    expect(parseGuestId(id)).toBe(id);
    for (const value of [undefined, "", "<script>", "admin", "4b579c57-a36b-149f-aecc-7459783b82da", `${id}; role=admin`]) {
      expect(parseGuestId(value)).toBeNull();
    }
  });
});
