import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PiIcon } from "@/components/BrandIcons";
import { ProviderIcon } from "@/components/ProviderIcon";

describe("PiIcon", () => {
  it("renders the official badge in app icon surfaces", () => {
    render(<PiIcon size={20} />);

    const icon = screen.getByRole("img", { name: "Pi" });
    expect(icon).toHaveAttribute("src", expect.stringContaining("pi.svg"));
    expect(icon).toHaveStyle({ width: "20px", height: "20px" });
  });

  it("renders the same badge through provider icon surfaces", () => {
    render(<ProviderIcon icon="pi" name="Pi" size="1.25rem" />);

    const icon = screen.getByRole("img", { name: "Pi" });
    expect(icon).toHaveAttribute("src", expect.stringContaining("pi.svg"));
    expect(icon).toHaveStyle({ width: "1.25rem", height: "1.25rem" });
  });
});
