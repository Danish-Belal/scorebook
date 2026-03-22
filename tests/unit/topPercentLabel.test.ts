import { topPercentLabel } from "../../src/utils/topPercentLabel";

describe("topPercentLabel", () => {
  it("returns Top 100% when empty set", () => {
    expect(topPercentLabel(0, 0)).toBe("Top 100%");
  });

  it("buckets by percentile of (rankIndex+1)/total", () => {
    expect(topPercentLabel(0, 100)).toBe("Top 1%"); // 1%
    expect(topPercentLabel(4, 100)).toBe("Top 5%"); // 5%
    expect(topPercentLabel(9, 100)).toBe("Top 10%");
    expect(topPercentLabel(24, 100)).toBe("Top 25%");
    expect(topPercentLabel(49, 100)).toBe("Top 50%");
    expect(topPercentLabel(74, 100)).toBe("Top 75%");
  });
});
